import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

// A small stateful database for the persistence acceptance (R3 D5).
//
// tests/support/fake-supabase.ts answers each query with a canned response, which is right
// for asserting one route's contract. It cannot answer the D5 question, which is about a
// sequence: create a project, write files into it, patch its content, mirror a commit, read
// the history back — and have a second user denied at every one of those steps. That needs
// rows that persist between calls and an owner rule that behaves like the real one.
//
// So this stores rows and enforces the policies from
// supabase/migrations/20260804120000_initial_schema.sql, transcribed below. It is not
// Postgres and does not pretend to be: no constraints, no triggers beyond updated_at, no
// cascade beyond what is written here. What it does model faithfully is the shape of an RLS
// refusal, which is the thing the routes are built on — RLS does not raise, it makes rows
// invisible, and every owner-scoping guarantee in the API depends on a route reading that
// silence as not_found (SEC-14).

export type Row = Record<string, unknown>;

/**
 * The owner rule per table, transcribed from the migrations' policies. `public` is
 * reference data — the template catalogue and the vertical profiles — readable by any
 * signed-in user.
 *
 * Every table in `public` must appear here. That is enforced two ways: `visible()` throws
 * on a table it does not know rather than guessing, and tests/db/fake-db-parity.pg.test.ts
 * compares this list against the tables a real Postgres actually ends up with after the
 * migrations run. Both exist because guessing has been wrong twice — `templates` was read
 * as owner-scoped and the whole catalogue vanished from the fake, and the four tables added
 * after this map was written were silently owner-scoped too, which hid the vertical
 * profiles from every test that touched them.
 */
type OwnerRule = "own_user_id" | "via_project" | "public" | "none";

const POLICIES: Record<string, OwnerRule> = {
    users: "own_user_id",
    templates: "public",
    projects: "own_user_id",
    project_files: "via_project",
    commits: "via_project",
    deployments: "via_project",
    assets: "via_project",
    generations: "own_user_id",
    entitlements: "own_user_id",
    ai_edit_proposals: "own_user_id",
    domains: "own_user_id",
    // Reference data shared by every generation, written only by the service role.
    vertical_profiles: "public",
    vertical_profile_aliases: "public",
    // Scratch-card catalogue: clients may SELECT but the policy is `using (false)`.
    discount_codes: "none",
    discount_redemptions: "own_user_id",
};

/** The tables this fake claims to model. Read by the parity test, not by the fake itself. */
export const TRANSCRIBED_TABLES: readonly string[] = Object.keys(POLICIES);

// Tables whose updated_at is maintained by a `before update` trigger.
const TOUCHES_UPDATED_AT = new Set(["projects", "users", "domains"]);

interface QueryError {
    message: string;
}

interface Result {
    data: unknown;
    error: QueryError | null;
}

export interface FakeDb {
    /** A client scoped to one signed-in user, exactly as supabaseRoute() would hand back. */
    asUser(userId: string): SupabaseClient;
    /** Direct row access, bypassing policies — for arranging fixtures and asserting state. */
    rows(table: string): Row[];
    insert(table: string, row: Row): Row;
    /**
     * Put bytes in the assets bucket at `storage_path`.
     *
     * The publish build downloads every referenced image and ships it with the site
     * (R3 D11), so a test that never stores anything can only ever exercise the
     * no-images case — which is how asset bundling went untested until R3 D15.
     */
    putObject(storagePath: string, contents: string): void;
}

export function createFakeDb(seed: Record<string, Row[]> = {}): FakeDb {
    const tables: Record<string, Row[]> = {};
    // storage_path -> bytes. Not owner-scoped: the bucket's own RLS is a storage policy
    // rather than a table policy, and the publish path reaches it having already proved
    // ownership of the project the assets belong to.
    const objects = new Map<string, string>();
    // Postgres timestamps distinguish sequential inserts. A test can perform
    // several inserts inside one JavaScript millisecond, so give the fake a
    // monotonic clock instead of making "newest" depend on a random UUID tie.
    let logicalTime = Date.now();
    const timestamp = () => new Date(logicalTime++).toISOString();
    for (const [name, rows] of Object.entries(seed)) {
        tables[name] = rows.map((row) => ({ ...row }));
    }

    const table = (name: string): Row[] => (tables[name] ??= []);

    function ownsProject(projectId: unknown, userId: string): boolean {
        return table("projects").some((p) => p.id === projectId && p.user_id === userId);
    }

    // The `using` / `with check` clause, in one place for both reads and writes.
    function visible(name: string, row: Row, userId: string): boolean {
        const rule = POLICIES[name];
        if (!rule) {
            // Never guess. The previous default was `own_user_id`, which is a plausible
            // rule and therefore the dangerous kind of wrong: applied to a table with no
            // user_id column it evaluates undefined === userId, hides every row, and the
            // test reads an empty table and passes. Failing loudly here turns "somebody
            // added a table and forgot the fake" into a build error instead of a quiet
            // hole in the coverage.
            throw new Error(
                `fake-db: no policy transcribed for "${name}". Add it to POLICIES in ` +
                    `tests/support/fake-db.ts, matching the migration that created the table.`,
            );
        }
        switch (rule) {
            case "public":
                return true;
            case "none":
                return false;
            case "via_project":
                return ownsProject(row.project_id, userId);
            default:
                return row.user_id === userId;
        }
    }

    function client(userId: string): SupabaseClient {
        const from = (name: string) => {
            let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
            let selected = false;
            let selectCols = "*";
            let payload: Row | Row[] = {};
            let onConflict: string[] = [];
            const filters: [string, unknown][] = [];
            let notIn: { column: string; values: string[] } | null = null;
            let anyOf: { column: string; values: unknown[] } | null = null;
            const orders: { column: string; ascending: boolean }[] = [];
            let take: number | null = null;

            const matches = (row: Row): boolean => {
                if (!filters.every(([column, value]) => row[column] === value)) return false;
                if (notIn && notIn.values.includes(String(row[notIn.column]))) return false;
                if (anyOf && !anyOf.values.includes(row[anyOf.column])) return false;
                return true;
            };

            // PostgREST resolves an embedded relation into a nested array. Only the one the
            // dashboard query uses is modelled.
            const withEmbeds = (row: Row): Row =>
                name === "projects" && selectCols.includes("deployments(")
                    ? { ...row, deployments: table("deployments").filter((d) => d.project_id === row.id) }
                    : row;

            const read = (): Row[] => {
                const found = table(name)
                    .filter((row) => visible(name, row, userId))
                    .filter(matches);

                for (const { column, ascending } of [...orders].reverse()) {
                    found.sort((a, b) => {
                        const x = String(a[column] ?? "");
                        const y = String(b[column] ?? "");
                        return ascending ? x.localeCompare(y) : y.localeCompare(x);
                    });
                }

                return (take === null ? found : found.slice(0, take)).map(withEmbeds);
            };

            const write = (): Result => {
                const now = timestamp();

                if (op === "insert" || op === "upsert") {
                    const incoming = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...r }));
                    const written: Row[] = [];

                    for (const candidate of incoming) {
                        // The `with check` half of the policy: you may not write a row you
                        // would not be allowed to read.
                        if (!visible(name, candidate, userId)) {
                            return { data: null, error: null }; // RLS refusal: no row comes back
                        }

                        const existing =
                            op === "upsert" && onConflict.length > 0
                                ? table(name).find((row) =>
                                      onConflict.every((column) => row[column] === candidate[column]),
                                  )
                                : undefined;

                        if (existing) {
                            Object.assign(existing, candidate);
                            written.push(existing);
                            continue;
                        }

                        const row: Row = {
                            id: randomUUID(),
                            created_at: now,
                            ...(TOUCHES_UPDATED_AT.has(name) ? { updated_at: now } : {}),
                            ...candidate,
                        };
                        table(name).push(row);
                        written.push(row);
                    }

                    return { data: written, error: null };
                }

                if (op === "update") {
                    // supabase-js serialises the payload as JSON, and JSON.stringify drops
                    // undefined values — so `{ name: undefined }` reaches PostgREST as `{}`.
                    // An update with nothing to set is not a valid statement; modelled as an
                    // error rather than a silent no-op so the routes cannot rely on it.
                    const changes = Object.fromEntries(
                        Object.entries(payload as Row).filter(([, value]) => value !== undefined),
                    );
                    if (Object.keys(changes).length === 0) {
                        return { data: null, error: { message: "empty PATCH payload: no columns to set" } };
                    }

                    const targets = table(name)
                        .filter((row) => visible(name, row, userId))
                        .filter(matches);

                    for (const row of targets) {
                        Object.assign(row, changes);
                        if (TOUCHES_UPDATED_AT.has(name)) row.updated_at = new Date().toISOString();
                    }

                    return { data: targets, error: null };
                }

                // delete
                const doomed = table(name)
                    .filter((row) => visible(name, row, userId))
                    .filter(matches);

                tables[name] = table(name).filter((row) => !doomed.includes(row));

                // The rows a real delete cascades to. Only the edges the persistence layer
                // relies on are modelled.
                if (name === "projects") {
                    for (const child of ["project_files", "commits", "deployments", "assets"]) {
                        tables[child] = table(child).filter(
                            (row) => !doomed.some((p) => p.id === row.project_id),
                        );
                    }
                }

                return { data: doomed, error: null };
            };

            const settle = (shape: "single" | "maybeSingle" | "many"): Result => {
                const result = op === "select" ? { data: read(), error: null } : write();
                if (result.error) return result;

                const rows = (result.data as Row[] | null) ?? [];

                if (shape === "many") return { data: rows, error: null };
                if (rows.length === 1) return { data: rows[0], error: null };
                if (rows.length === 0) {
                    return shape === "maybeSingle"
                        ? { data: null, error: null }
                        : { data: null, error: { message: "no rows returned" } };
                }
                return { data: null, error: { message: "multiple rows returned" } };
            };

            const builder: Record<string, unknown> = {
                select: (cols?: string) => {
                    if (op === "select") selectCols = cols ?? "*";
                    selected = true;
                    return builder;
                },
                insert: (rows: Row | Row[]) => ((op = "insert"), (payload = rows), builder),
                update: (row: Row) => ((op = "update"), (payload = row), builder),
                upsert: (rows: Row | Row[], options?: { onConflict?: string }) => {
                    op = "upsert";
                    payload = rows;
                    onConflict = options?.onConflict?.split(",").map((c) => c.trim()) ?? [];
                    return builder;
                },
                delete: () => ((op = "delete"), builder),
                eq: (column: string, value: unknown) => (filters.push([column, value]), builder),
                // `.in(column, values)` — used by openDeployment to ask for the attempts
                // that have not finished. Missing until R3 D18, which is why the publish
                // route's concurrency guard had never been exercised against this fake.
                in: (column: string, values: unknown[]) => ((anyOf = { column, values }), builder),
                not: (column: string, operator: string, value: string) => {
                    if (operator === "in") {
                        notIn = {
                            column,
                            values: value
                                .replace(/^\(|\)$/g, "")
                                .split(",")
                                .map((v) => v.trim().replace(/^"|"$/g, ""))
                                .filter(Boolean),
                        };
                    }
                    return builder;
                },
                order: (column: string, options?: { ascending?: boolean }) => (
                    orders.push({ column, ascending: options?.ascending ?? true }), builder
                ),
                limit: (n: number) => ((take = n), builder),
                single: () => Promise.resolve(settle("single")),
                maybeSingle: () => Promise.resolve(settle("maybeSingle")),
                then: (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
                    Promise.resolve(settle(selected || op === "select" ? "many" : "many")).then(
                        resolve,
                        reject,
                    ),
            };

            return builder;
        };

        // Database functions the routes call through supabase.rpc(). Modelled by hand, the
        // same way the policies above are: what matters is that the caller sees the shape of
        // the real answer, including the shape of a refusal.
        const rpc = async (name: string, args: Record<string, unknown>): Promise<Result> => {
            if (name !== "replace_project_files") {
                return { data: null, error: { message: `unknown function ${name}` } };
            }

            const projectId = args.p_project_id as string;
            const files = (args.p_files ?? {}) as Record<string, string>;

            // security invoker: the function runs under the caller's policies, so a project
            // that is not theirs is simply not there — which the function raises on rather
            // than silently writing nothing.
            const project = table("projects").find(
                (p) => p.id === projectId && p.user_id === userId,
            );
            if (!project) return { data: null, error: { message: "project_not_found" } };

            // The precondition, transcribed from the migration (R3 D6). Null means the
            // caller did not ask for one, which is still last-writer-wins by design.
            const expected = args.p_expected_updated_at as string | null | undefined;
            if (expected != null && project.updated_at !== expected) {
                return { data: null, error: { message: "stale_write" } };
            }

            const now = new Date().toISOString();
            const paths = Object.keys(files);

            tables.project_files = table("project_files").filter(
                (f) => f.project_id !== projectId || paths.includes(String(f.path)),
            );

            for (const path of paths) {
                const existing = table("project_files").find(
                    (f) => f.project_id === projectId && f.path === path,
                );

                if (existing) {
                    // The real statement only touches a row whose content actually changed.
                    if (existing.content !== files[path]) {
                        existing.content = files[path];
                        existing.updated_at = now;
                    }
                    continue;
                }

                table("project_files").push({
                    id: randomUUID(),
                    project_id: projectId,
                    path,
                    content: files[path],
                    created_at: now,
                    updated_at: now,
                });
            }

            project.updated_at = now;

            return { data: now, error: null };
        };

        const storage = {
            // The bucket name is ignored: there is one bucket, and a test that named the
            // wrong one should fail on the missing object rather than pass quietly.
            from: () => ({
                download: async (path: string) => {
                    const contents = objects.get(path);
                    return contents === undefined
                        ? { data: null, error: { message: `no object at ${path}` } }
                        : { data: new Blob([contents]), error: null };
                },
            }),
        };

        return { from, rpc, storage } as unknown as SupabaseClient;
    }

    return {
        asUser: client,
        rows: (name: string) => table(name),
        insert: (name: string, row: Row) => {
            const created: Row = { id: randomUUID(), created_at: timestamp(), ...row };
            table(name).push(created);
            return created;
        },
        putObject: (storagePath: string, contents: string) => {
            objects.set(storagePath, contents);
        },
    };
}
