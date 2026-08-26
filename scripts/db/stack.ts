import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Runs the migration stack against a real Postgres.
//
// Twenty migration files existed for eleven days and not one of them had ever been executed
// by Postgres. The RLS policies were transcribed by hand into tests/support/fake-db.ts, and
// a transcription can be wrong in the same direction twice: the fake agrees with the belief
// that produced it, not with the database. Everything the suite proved about ownership was
// proved against that belief.
//
// `supabase db reset` is the right tool and needs Docker, which is not on this machine and
// will not be on every machine that ever needs to check this. PGlite is Postgres itself
// compiled to WebAssembly — the same parser, planner, type system and row-security
// implementation, in-process, with no daemon. It will not catch anything specific to
// Supabase's build (see LIMITS below), but it catches the entire class of thing that had
// never once been checked: whether the SQL is valid, whether the objects it references
// exist, whether the constraints hold, and whether the policies actually filter.
//
// LIMITS, so nobody reads a green run as more than it is:
//   · Postgres 18 here; hosted Supabase is on 15/17. Core DDL is the same, but a version
//     difference is a real difference and this cannot speak for one.
//   · The platform objects come from scripts/db/platform-prelude.sql, which is our
//     reconstruction of Supabase's, not Supabase's own.
//   · GoTrue, PostgREST and Storage are not running. What is tested is the database.
// It is not a replacement for `supabase db reset`. It is what stands in until one runs, and
// it is the difference between twenty unexecuted files and twenty executed ones.

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const PRELUDE = join(ROOT, "scripts", "db", "platform-prelude.sql");
const SEED = join(ROOT, "supabase", "seed.sql");

export type StepResult = {
    name: string;
    ok: boolean;
    ms: number;
    error?: string;
};

export type Stack = {
    db: PGlite;
    steps: StepResult[];
};

/** Migration files in the order Supabase would apply them: lexicographic by filename. */
export function migrationFiles(): string[] {
    return readdirSync(MIGRATIONS)
        .filter((f) => f.endsWith(".sql"))
        .sort();
}

/**
 * Builds a database from nothing: platform prelude, then every migration in order, then
 * optionally the seed. Stops at the first failure, because a migration that runs after a
 * failed one is being applied to a database that would never exist.
 */
export async function buildStack({ seed = false } = {}): Promise<Stack> {
    const db = await PGlite.create({ extensions: { pgcrypto } });
    const steps: StepResult[] = [];

    const run = async (name: string, sql: string) => {
        const started = performance.now();
        try {
            await db.exec(sql);
            steps.push({ name, ok: true, ms: performance.now() - started });
            return true;
        } catch (error) {
            steps.push({
                name,
                ok: false,
                ms: performance.now() - started,
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    };

    if (!(await run("platform prelude", readFileSync(PRELUDE, "utf8")))) return { db, steps };

    for (const file of migrationFiles()) {
        const sql = readFileSync(join(MIGRATIONS, file), "utf8");
        if (!(await run(file, sql))) return { db, steps };
        const version = file.replace(/_.*$/, "");
        await db.query(
            "insert into supabase_migrations.schema_migrations (version) values ($1) on conflict do nothing",
            [version],
        );
    }

    if (seed) await run("seed.sql", readFileSync(SEED, "utf8"));

    return { db, steps };
}

/**
 * Runs `body` as a signed-in user, the way PostgREST does it: assume the `authenticated`
 * role and put the user's id in the JWT claims GUC that auth.uid() reads.
 *
 * This is the part that makes the whole exercise worth doing. A policy only proves anything
 * when a role that cannot bypass it is the one running the query — as the superuser, every
 * policy in the schema is inert and every test passes.
 */
export async function asUser<T>(db: PGlite, userId: string, body: () => Promise<T>): Promise<T> {
    // Session-scoped, not `set local`. SET LOCAL outside a transaction is a documented no-op:
    // Postgres warns and carries on, so the role never changes, every query runs as the
    // superuser, and a superuser bypasses row security entirely. The first draft of this
    // helper used SET LOCAL and the whole ownership suite passed while proving nothing —
    // which is the same failure mode as the fake database it was written to check.
    await db.exec(`
        set role authenticated;
        select set_config('request.jwt.claims', '${JSON.stringify({ sub: userId, role: "authenticated" })}', false);
    `);
    try {
        return await body();
    } finally {
        await db.exec("reset role; select set_config('request.jwt.claims', '', false);");
    }
}

/** Runs `body` with row security in force but no user — an anonymous caller. */
export async function asAnon<T>(db: PGlite, body: () => Promise<T>): Promise<T> {
    await db.exec("set role anon; select set_config('request.jwt.claims', '', false);");
    try {
        return await body();
    } finally {
        await db.exec("reset role;");
    }
}

/** Creates an auth user and lets the profile trigger make the public.users row. */
export async function createUser(db: PGlite, email: string): Promise<string> {
    const rows = await db.query<{ id: string }>(
        "insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id",
        [email],
    );
    return rows.rows[0]!.id;
}
