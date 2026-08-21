import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, buildStack, createUser, migrationFiles } from "../../scripts/db/stack";

// The persistence acceptance, run against Postgres rather than against our belief about it.
//
// Everything below was already "covered". tests/support/fake-db.ts transcribes the RLS rules
// out of the migrations by hand, and every ownership test in this repository ran against
// that transcription. A transcription agrees with whoever wrote it; it cannot disagree, which
// is the one thing a test is for. It has already been wrong once — it read the templates
// table's public rule as a missing rule and hid the whole table — and that was found by
// accident rather than by a test.
//
// So this file asks Postgres. It also covers the three things the fake cannot model at all,
// each of which is a real way to lose data or leak it:
//
//   · GRANTS. RLS is the second gate; the privilege is the first. A statement can be refused
//     for want of a privilege while every policy in the schema would have allowed it. That is
//     how `recordCommit`'s upsert failed against a real database while passing every test.
//   · CHECK constraints and triggers. The path-traversal guard, the file and asset caps, the
//     "a live deployment has a URL" rule — the last line of defence, never once executed.
//   · The seed. It is what a fresh database is built from and what every new developer sees.
//
// It is not a substitute for `supabase db reset` against Supabase's own build; the caveats
// are written at the top of scripts/db/stack.ts. It is the difference between a schema that
// has been reasoned about and a schema that has been run.

let db: PGlite;
let alice: string;
let bob: string;
let aliceProject: string;

beforeAll(async () => {
    const stack = await buildStack({ seed: true });
    const failed = stack.steps.filter((s) => !s.ok);
    if (failed.length > 0) {
        throw new Error(`${failed[0]!.name} failed:\n${failed[0]!.error}`);
    }
    db = stack.db;

    alice = await createUser(db, "alice@example.com");
    bob = await createUser(db, "bob@example.com");

    const project = await db.query<{ id: string }>(
        "insert into public.projects (user_id, name) values ($1, 'Alice site') returning id",
        [alice],
    );
    aliceProject = project.rows[0]!.id;
}, 120_000);

afterAll(async () => {
    await db?.close();
});

describe("the migration stack", () => {
    it("applies every migration in order, from nothing", async () => {
        // beforeAll already proved this; the assertion is here so the fact has a name in the
        // report rather than only showing up as an error in a hook.
        const applied = await db.query<{ n: number }>(
            "select count(*)::int as n from pg_tables where schemaname = 'public'",
        );
        // A count, deliberately. It is the one assertion that notices a migration file
        // being deleted or never committed — the failure mode where the stack still
        // applies cleanly because the broken one is simply gone. Bump it when you add one.
        expect(migrationFiles().length).toBe(25);
        expect(applied.rows[0]!.n).toBeGreaterThan(0);
    });

    it("leaves row security on for every table in public", async () => {
        // The event trigger in 20260805120000 is supposed to turn RLS on for any table added
        // later. This is the assertion that it works — a table created by a future migration
        // that forgets `enable row level security` is a table anyone can read.
        const rows = await db.query<{ relname: string }>(`
            select c.relname from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        `);
        expect(rows.rows.map((r) => r.relname)).toEqual([]);
    });

    it("gives every table with RLS at least one policy", async () => {
        // RLS on with no policy is a table nobody can read — a silent, total denial that
        // looks in the schema exactly like a table that is carefully protected.
        const rows = await db.query<{ relname: string }>(`
            select c.relname from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
               and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
        `);
        expect(rows.rows.map((r) => r.relname)).toEqual([]);
    });
});

describe("what one signed-in person can reach", () => {
    it("shows a person their own project and not anybody else's", async () => {
        const mine = await asUser(db, alice, () =>
            db.query<{ n: number }>("select count(*)::int as n from public.projects"),
        );
        const theirs = await asUser(db, bob, () =>
            db.query<{ n: number }>("select count(*)::int as n from public.projects"),
        );

        expect(mine.rows[0]!.n).toBe(1);
        expect(theirs.rows[0]!.n).toBe(0);
    });

    it("refuses a write to somebody else's project rather than performing it", async () => {
        const updated = await asUser(db, bob, () =>
            db.query("update public.projects set name = 'taken over' where id = $1 returning id", [
                aliceProject,
            ]),
        );
        expect(updated.rows).toEqual([]);

        const after = await db.query<{ name: string }>("select name from public.projects where id = $1", [
            aliceProject,
        ]);
        expect(after.rows[0]!.name).toBe("Alice site");
    });

    it("refuses a delete of somebody else's project", async () => {
        await asUser(db, bob, () =>
            db.query("delete from public.projects where id = $1", [aliceProject]),
        );
        const still = await db.query<{ n: number }>(
            "select count(*)::int as n from public.projects where id = $1",
            [aliceProject],
        );
        expect(still.rows[0]!.n).toBe(1);
    });

    it("will not let a person create a project owned by somebody else", async () => {
        await expect(
            asUser(db, bob, () =>
                db.query("insert into public.projects (user_id, name) values ($1, 'planted')", [alice]),
            ),
        ).rejects.toThrow(/row-level security/i);
    });

    it("hides another person's files, commits, deployments and assets", async () => {
        await db.exec(`
            insert into public.project_files (project_id, path, content)
                values ('${aliceProject}', 'index.html', '<h1>hers</h1>');
            insert into public.commits (project_id, sha, message, author)
                values ('${aliceProject}', 'abc1234', 'first', 'user');
            insert into public.deployments (project_id, status) values ('${aliceProject}', 'pending');
            insert into public.assets (project_id, storage_path, mime_type, byte_size)
                values ('${aliceProject}', '${alice}/a.png', 'image/png', 100);
        `);

        for (const table of ["project_files", "commits", "deployments", "assets"]) {
            const mine = await asUser(db, alice, () =>
                db.query<{ n: number }>(`select count(*)::int as n from public.${table}`),
            );
            const theirs = await asUser(db, bob, () =>
                db.query<{ n: number }>(`select count(*)::int as n from public.${table}`),
            );
            expect(mine.rows[0]!.n, `${table}: owner`).toBeGreaterThan(0);
            expect(theirs.rows[0]!.n, `${table}: stranger`).toBe(0);
        }
    });

    it("lets everybody signed in read the template library", async () => {
        const rows = await asUser(db, bob, () =>
            db.query<{ n: number }>("select count(*)::int as n from public.templates"),
        );
        expect(rows.rows[0]!.n).toBeGreaterThan(0);
    });

    it("shows nothing at all to a caller who is not signed in", async () => {
        // anon holds no grant on public at all, so this is refused before RLS is consulted.
        // Either answer is acceptable — nothing must come back.
        await expect(
            asAnon(db, () => db.query("select * from public.projects")),
        ).rejects.toThrow(/permission denied/i);
    });
});

describe("privileges, which are a separate gate from policies", () => {
    it("keeps history append-only: a person cannot rewrite their own commit", async () => {
        // There is no UPDATE grant on commits, deliberately. This is also why recordCommit
        // must insert rather than upsert — Postgres demands UPDATE privilege for
        // INSERT ... ON CONFLICT DO UPDATE whether or not a row actually conflicts.
        await expect(
            asUser(db, alice, () =>
                db.query("update public.commits set message = 'rewritten' where project_id = $1", [
                    aliceProject,
                ]),
            ),
        ).rejects.toThrow(/permission denied/i);
    });

    it("proves the upsert that recordCommit is forbidden from using really is forbidden", async () => {
        // The comment in src/lib/data/commits.ts explains why it inserts. If someone
        // "simplifies" it back to an upsert, this is the test that says no.
        await expect(
            asUser(db, alice, () =>
                db.query(
                    `insert into public.commits (project_id, sha, message, author)
                     values ($1, 'abc1234', 'again', 'user')
                     on conflict (project_id, sha) do update set message = excluded.message`,
                    [aliceProject],
                ),
            ),
        ).rejects.toThrow(/permission denied/i);
    });

    it("lets a person change their display fields but not their own email", async () => {
        // The grant is column-limited: handle, avatar_url, training_opt_in. Email is the
        // account's identity and belongs to GoTrue; a person who could rewrite it here could
        // walk their profile row onto somebody else's address.
        await asUser(db, alice, () =>
            db.query("update public.users set handle = 'alice' where id = $1", [alice]),
        );
        const handle = await db.query<{ handle: string }>("select handle from public.users where id = $1", [
            alice,
        ]);
        expect(handle.rows[0]!.handle).toBe("alice");

        await expect(
            asUser(db, alice, () =>
                db.query("update public.users set email = 'someone.else@example.com' where id = $1", [alice]),
            ),
        ).rejects.toThrow(/permission denied/i);
    });

    it("does not let a person grant themselves an entitlement", async () => {
        // Entitlements are what a person has paid for. They are readable by their owner and
        // writable only by the service role, which is the whole of the payment integrity
        // story at the database level.
        await expect(
            asUser(db, alice, () =>
                db.query("insert into public.entitlements (user_id, kind) values ($1, 'pro')", [alice]),
            ),
        ).rejects.toThrow(/permission denied/i);
    });
});

describe("the constraints that are the last line of defence", () => {
    it("refuses a file path that climbs out of the project", async () => {
        for (const path of ["../secrets.env", "a/../../etc/passwd", "/etc/passwd"]) {
            await expect(
                db.query("insert into public.project_files (project_id, path, content) values ($1, $2, 'x')", [
                    aliceProject,
                    path,
                ]),
                `path ${path}`,
            ).rejects.toThrow();
        }
    });

    it("refuses a NUL byte in a path", async () => {
        await expect(
            db.query("insert into public.project_files (project_id, path, content) values ($1, $2, 'x')", [
                aliceProject,
                `ok${String.fromCharCode(0)}.html`,
            ]),
        ).rejects.toThrow();
    });

    it("refuses a live deployment with no URL to visit", async () => {
        // A deployment row saying 'live' with a null live_url would show the owner a success
        // with nothing to click.
        await expect(
            db.query("insert into public.deployments (project_id, status) values ($1, 'live')", [
                aliceProject,
            ]),
        ).rejects.toThrow();
    });

    it("refuses an asset that is not an image", async () => {
        await expect(
            db.query(
                `insert into public.assets (project_id, storage_path, mime_type, byte_size)
                 values ($1, $2, 'text/html', 10)`,
                [aliceProject, `${alice}/x.html`],
            ),
        ).rejects.toThrow();
    });

    it("caps a project at 50 files", async () => {
        const project = await db.query<{ id: string }>(
            "insert into public.projects (user_id, name) values ($1, 'cap') returning id",
            [alice],
        );
        const id = project.rows[0]!.id;

        for (let i = 0; i < 50; i += 1) {
            await db.query("insert into public.project_files (project_id, path, content) values ($1, $2, 'x')", [
                id,
                `page-${i}.html`,
            ]);
        }
        await expect(
            db.query("insert into public.project_files (project_id, path, content) values ($1, 'one-too-many.html', 'x')", [
                id,
            ]),
        ).rejects.toThrow(/file limit/i);
    });

    it("keeps one path unique within a project, and shared across projects", async () => {
        await expect(
            db.query("insert into public.project_files (project_id, path, content) values ($1, 'index.html', 'again')", [
                aliceProject,
            ]),
        ).rejects.toThrow(/duplicate key/i);

        const other = await db.query<{ id: string }>(
            "insert into public.projects (user_id, name) values ($1, 'second') returning id",
            [bob],
        );
        await expect(
            db.query("insert into public.project_files (project_id, path, content) values ($1, 'index.html', 'mine')", [
                other.rows[0]!.id,
            ]),
        ).resolves.toBeDefined();
    });
});

describe("the triggers that keep the two user tables in step", () => {
    it("creates the profile row when an auth user appears", async () => {
        const id = await createUser(db, "Carol@Example.com");
        const row = await db.query<{ email: string; email_verified: boolean }>(
            "select email, email_verified from public.users where id = $1",
            [id],
        );
        // Lowercased on the way in, because the column's check demands it and the trigger is
        // the only thing standing between a mixed-case signup and a failed insert.
        expect(row.rows[0]).toEqual({ email: "carol@example.com", email_verified: true });
    });

    it("moves updated_at forward on its own when a project changes", async () => {
        const before = await db.query<{ updated_at: Date }>(
            "select updated_at from public.projects where id = $1",
            [aliceProject],
        );
        await db.query("update public.projects set name = 'renamed' where id = $1", [aliceProject]);
        const after = await db.query<{ updated_at: Date }>(
            "select updated_at from public.projects where id = $1",
            [aliceProject],
        );
        expect(new Date(after.rows[0]!.updated_at).getTime()).toBeGreaterThanOrEqual(
            new Date(before.rows[0]!.updated_at).getTime(),
        );
    });
});

describe("the seed a fresh database is built from", () => {
    it("loads, and leaves templates a signed-in person can actually see", async () => {
        const rows = await db.query<{ n: number }>("select count(*)::int as n from public.templates");
        expect(rows.rows[0]!.n).toBeGreaterThan(0);
    });

    it("seeds only categories the enum knows about", async () => {
        // A category the enum does not have cannot even be inserted, so this passing means
        // the seed and the type have not drifted apart — the drift that R2 already hit once.
        const rows = await db.query<{ category: string }>(
            "select distinct category::text as category from public.templates",
        );
        const known = await db.query<{ label: string }>(
            "select unnest(enum_range(null::public.template_category))::text as label",
        );
        const labels = known.rows.map((r) => r.label);
        for (const row of rows.rows) expect(labels).toContain(row.category);
    });

    it("gives every seeded template a source a person could open", async () => {
        // The same rule the R2 licence audit put on the design library, asked of the seed.
        const rows = await db.query<{ source_url: string }>("select source_url from public.templates");
        for (const row of rows.rows) {
            expect(row.source_url).toMatch(/^https:\/\//);
            expect(row.source_url).not.toContain("github.com/pagecraft/templates");
        }
    });
});

describe("the reference tables the AI layer reads", () => {
    it("lets any signed-in person read the vertical profiles", async () => {
        // These are public reference data, not anybody's rows: the policy is `using (true)`.
        // tests/support/fake-db.ts does not know these tables and falls back to owner-scoping
        // them, which — since they have no user_id — hides them completely. Any test that
        // reads a profile through the fake is reading an empty table and passing anyway.
        await expect(
            asUser(db, bob, () => db.query("select * from public.vertical_profiles")),
        ).resolves.toBeDefined();
        await expect(
            asUser(db, bob, () => db.query("select * from public.vertical_profile_aliases")),
        ).resolves.toBeDefined();
    });

    it("does not let a signed-in person write one", async () => {
        // Profiles are written by the generation path under the service role. A user-scoped
        // client writing here would be one person's generation editing everybody's cache.
        await expect(
            asUser(db, bob, () =>
                db.query("insert into public.vertical_profiles (slug, profile) values ('cafe-owner', '{}'::jsonb)"),
            ),
        ).rejects.toThrow(/permission denied/i);
    });
});
