import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "../support/fake-db";

// R3 D5 · the persistence acceptance.
//
//   "Run the persistence acceptance: create project, write/read files, patch content,
//    commit + read history — all owner-scoped, cross-user denied."
//
// The D4 contract tests ask whether each route answers in the documented shape. This asks a
// different question, and the only one a milestone can be built on: does the whole thing
// work as a sequence, and does it hold against a second person the whole way through.
//
// Every step below goes through the real route handler. The database is
// tests/support/fake-db.ts, which stores rows and applies the migration's own policies —
// so "denied" here means what it means in production: the row is simply not there, and the
// route has to turn that silence into not_found rather than into an empty success.
//
// What this does NOT prove: that the SQL policies themselves are right. They are
// transcribed into the fake by hand, and a transcription can be wrong in the same direction
// twice. One `supabase db reset` run against the real database is still owed before D10.

const auth = vi.hoisted(() => ({ requireUser: vi.fn(), supabaseRoute: vi.fn() }));
const password = vi.hoisted(() => ({ authenticateWithPassword: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
    requireUser: auth.requireUser,
    supabaseRoute: auth.supabaseRoute,
}));

vi.mock("@/lib/auth/password-check", () => ({
    authenticateWithPassword: password.authenticateWithPassword,
    passwordAttemptResponse: (result: { code: string; message: string }) =>
        Response.json(
            { ok: false, error: { code: result.code, message: result.message } },
            { status: result.code === "rate_limited" ? 429 : result.code === "forbidden" ? 403 : 401 },
        ),
    PASSWORD_GENERIC_FAILURE: "That email and password combination is not correct.",
    PASSWORD_THROTTLED: "Too many sign-in attempts. Try again in a few minutes.",
}));

const OWNER = "11111111-1111-4111-8111-000000000001";
const STRANGER = "11111111-1111-4111-8111-000000000002";
const OWNER_EMAIL = "owner@pagecraft.test";
const STRANGER_EMAIL = "stranger@pagecraft.test";
const OWNER_PASSWORD = "correct-horse";
const TEMPLATE_ID = "22222222-2222-4222-8222-000000000001";

const CONTENT_SCHEMA = {
    sections: [
        {
            key: "hero",
            label: "Hero",
            fields: [{ key: "headline", label: "Headline", type: "text", maxLength: 60 }],
        },
    ],
};

// templates.files is `not null` in the schema, and forking copies it into the project's own
// working tree (R3 D8) — so a fixture without it is a template that could not exist.
const TEMPLATE_FILES = {
    "index.html": "<!doctype html><html><body><h1>Ember</h1></body></html>",
    "styles.css": "body{margin:0}",
};

let db: FakeDb;

/** Point the route kernel at one signed-in user for the next call. */
function signedInAs(userId: string) {
    const supabase = db.asUser(userId);
    const email = userId === OWNER ? OWNER_EMAIL : STRANGER_EMAIL;
    auth.requireUser.mockResolvedValue({ userId, supabase, email });
    auth.supabaseRoute.mockResolvedValue(supabase);
}

const url = (path: string, init?: RequestInit) =>
    new Request(`http://localhost${path}`, init) as never;

const jsonBody = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
});

const params = (value: Record<string, unknown>) => ({ params: Promise.resolve(value) }) as never;

async function body(response: Response) {
    return { status: response.status, json: await response.json() };
}

beforeEach(() => {
    vi.clearAllMocks();
    password.authenticateWithPassword.mockResolvedValue({ ok: true, user: { id: OWNER } });
    db = createFakeDb({
        users: [{ id: OWNER }, { id: STRANGER }],
        templates: [
            { id: TEMPLATE_ID, name: "Ember", files: TEMPLATE_FILES, content_schema: CONTENT_SCHEMA },
        ],
    });
});

describe("the owner's full round trip", () => {
    it("creates, writes, reads, edits, commits and reads history — then deletes", async () => {
        const projects = await import("@/app/api/v1/projects/route");
        const project = await import("@/app/api/v1/projects/[id]/route");
        const files = await import("@/app/api/v1/projects/[id]/files/route");
        const file = await import("@/app/api/v1/projects/[id]/files/[...path]/route");
        const content = await import("@/app/api/v1/projects/[id]/content/route");
        const commits = await import("@/app/api/v1/projects/[id]/commits/route");
        const { recordCommit } = await import("@/lib/data/commits");

        // 1. Create.
        signedInAs(OWNER);
        const created = await body(
            await projects.POST(
                url("/api/v1/projects", jsonBody("POST", { name: "Kettle & Co.", sourceTemplateId: TEMPLATE_ID })),
            ),
        );
        expect(created.status).toBe(201);
        const id = created.json.data.id as string;

        // 2. It appears on the dashboard, as a draft with no live address (C-05).
        signedInAs(OWNER);
        const listed = await body(await projects.GET(url("/api/v1/projects")));
        expect(listed.json.data.items).toHaveLength(1);
        expect(listed.json.data.items[0]).toMatchObject({ id, status: "draft", liveUrl: null });

        // 3. Write the working tree.
        signedInAs(OWNER);
        const put = await body(
            await files.PUT(
                url(`/api/v1/projects/${id}/files`, jsonBody("PUT", {
                    files: { "index.html": "<h1>Kettle</h1>", "styles.css": "body{}" },
                })),
                params({ id }),
            ),
        );
        expect(put.status).toBe(200);
        expect(Object.keys(put.json.data.files).sort()).toEqual(["index.html", "styles.css"]);

        // 4. Read one file back.
        signedInAs(OWNER);
        const read = await body(
            await file.GET(url(`/api/v1/projects/${id}/files/index.html`), params({ id, path: ["index.html"] })),
        );
        expect(read.json.data.content).toBe("<h1>Kettle</h1>");

        // 5. Write one file. It marks the tree dirty and must not commit (V-4).
        signedInAs(OWNER);
        const wrote = await body(
            await file.PUT(
                url(`/api/v1/projects/${id}/files/index.html`, jsonBody("PUT", { content: "<h1>Kettle & Co.</h1>" })),
                params({ id, path: ["index.html"] }),
            ),
        );
        expect(wrote.status).toBe(200);
        expect(wrote.json.data.dirty).toBe(true);
        // Still only the fork's own commit: writing a file marks the tree dirty and never
        // commits, because committing is an explicit act (V-4).
        expect(db.rows("commits")).toHaveLength(1);

        // 6. Edit the content through the panel's endpoint.
        signedInAs(OWNER);
        const patched = await body(
            await content.PATCH(
                url(`/api/v1/projects/${id}/content`, jsonBody("PATCH", {
                    ops: [{ path: "hero.headline", value: "Coffee worth walking for." }],
                })),
                params({ id }),
            ),
        );
        expect(patched.json.data).toEqual({ rendered: true, dirty: true });
        expect(db.rows("projects")[0]!.content_json).toMatchObject({
            hero: { headline: "Coffee worth walking for." },
        });

        // 7. Mirror a commit — the write half of D4's mirror, as D6's endpoint will call it.
        await recordCommit(db.asUser(OWNER), id, {
            sha: "a1b2c3d4e5f6789012345678901234567890abcd",
            message: "Save the hero",
            author: "user",
        });

        // 8. Read the history. One indexed query, no git call.
        signedInAs(OWNER);
        const history = await body(await commits.GET(url(`/api/v1/projects/${id}/commits`), params({ id })));
        // Two: the fork's own commit, then this one. Newest first.
        expect(history.json.data.items).toHaveLength(2);
        expect(history.json.data.items[0]).toMatchObject({ message: "Save the hero", author: "user" });
        expect(history.json.data.items[1]).toMatchObject({ message: "Created from Ember", author: "system" });

        // 9. Delete removes our rows and their children — only after the same
        // password check as sign-in.
        signedInAs(OWNER);
        const deleted = await body(
            await project.DELETE(
                url(`/api/v1/projects/${id}`, jsonBody("DELETE", { email: OWNER_EMAIL, password: OWNER_PASSWORD })),
                params({ id }),
            ),
        );
        expect(deleted.json.data).toEqual({ deleted: true });
        expect(db.rows("projects")).toHaveLength(0);
        expect(db.rows("project_files")).toHaveLength(0);
    });

    // The Week-1 exit condition for this slice, stated as a test: "using a template creates
    // a project with version #1 recorded".
    it("picking a design copies it in and records version #1 (R3 D8)", async () => {
        const projects = await import("@/app/api/v1/projects/route");
        const files = await import("@/app/api/v1/projects/[id]/files/route");
        const commits = await import("@/app/api/v1/projects/[id]/commits/route");

        signedInAs(OWNER);
        const created = await body(
            await projects.POST(
                url("/api/v1/projects", jsonBody("POST", { name: "Kettle & Co.", sourceTemplateId: TEMPLATE_ID })),
            ),
        );

        expect(created.status).toBe(201);
        expect(created.json.data.firstCommit).toMatch(/^[0-9a-f]{7,40}$/);
        const id = created.json.data.id as string;

        // The design is now the project's own working tree — a copy, not a reference.
        signedInAs(OWNER);
        const tree = await body(await files.GET(url(`/api/v1/projects/${id}/files`), params({ id })));
        expect(tree.json.data.files).toEqual(TEMPLATE_FILES);

        // And there is somewhere to go back to.
        signedInAs(OWNER);
        const history = await body(await commits.GET(url(`/api/v1/projects/${id}/commits`), params({ id })));
        expect(history.json.data.items).toHaveLength(1);
        expect(history.json.data.items[0]).toMatchObject({
            sha: created.json.data.firstCommit,
            message: "Created from Ember",
            author: "system",
        });

        // Editing the project left the catalogue alone.
        expect(db.rows("templates")[0]!.files).toEqual(TEMPLATE_FILES);
    });

    // The D10 milestone in one test: pick a design, change it, save the change, change your
    // mind, and get the old site back — every step through the real route handler, with a
    // second user locked out of all of it.
    it("the core loop closes: fork, edit, save, restore (R3 D9)", async () => {
        const projects = await import("@/app/api/v1/projects/route");
        const files = await import("@/app/api/v1/projects/[id]/files/route");
        const commits = await import("@/app/api/v1/projects/[id]/commits/route");
        const restore = await import("@/app/api/v1/projects/[id]/restore/route");

        // 1. Fork. The design is in, and version #1 is recorded.
        signedInAs(OWNER);
        const created = await body(
            await projects.POST(
                url("/api/v1/projects", jsonBody("POST", { name: "Kettle & Co.", sourceTemplateId: TEMPLATE_ID })),
            ),
        );
        const id = created.json.data.id as string;
        const asForked = created.json.data.firstCommit as string;

        // 2. Change the site.
        const edited = { ...TEMPLATE_FILES, "index.html": "<h1>Kettle &amp; Co.</h1>" };
        signedInAs(OWNER);
        await files.PUT(
            url(`/api/v1/projects/${id}/files`, jsonBody("PUT", { files: edited })),
            params({ id }),
        );

        // 3. Save that as a version of its own.
        signedInAs(OWNER);
        const saved = await body(
            await commits.POST(
                url(`/api/v1/projects/${id}/commits`, jsonBody("POST", { message: "New heading" })),
                params({ id }),
            ),
        );
        expect(saved.status).toBe(201);
        expect(saved.json.data.sha).not.toBe(asForked);

        // 4. Change your mind. Go back to the design as it arrived.
        signedInAs(OWNER);
        const restored = await body(
            await restore.POST(
                url(`/api/v1/projects/${id}/restore`, jsonBody("POST", { sha: asForked })),
                params({ id }),
            ),
        );
        expect(restored.status).toBe(200);
        expect(restored.json.data.newSha).toBe(asForked);

        // 5. The files really came back — not a reported success over an unchanged tree.
        signedInAs(OWNER);
        const tree = await body(await files.GET(url(`/api/v1/projects/${id}/files`), params({ id })));
        expect(tree.json.data.files).toEqual(TEMPLATE_FILES);

        // 6. And going forward again is still possible: nothing was rewritten (BR-15).
        //
        // Both versions, not their order. History is ordered by (created_at desc, id desc),
        // and every commit in this test is written inside the same millisecond — so the
        // tiebreaker is a random uuid and the order is genuinely arbitrary here. What the
        // step is proving is that restoring did not remove the version it moved away from;
        // ordering is covered where timestamps actually differ, in commit-mirror.test.ts.
        signedInAs(OWNER);
        const history = await body(await commits.GET(url(`/api/v1/projects/${id}/commits`), params({ id })));
        expect(
            history.json.data.items.map((c: { message: string }) => c.message).sort(),
        ).toEqual(["Created from Ember", "New heading"]);

        // 7. None of it is reachable by anyone else.
        signedInAs(STRANGER);
        const theirs = await body(
            await restore.POST(
                url(`/api/v1/projects/${id}/restore`, jsonBody("POST", { sha: asForked })),
                params({ id }),
            ),
        );
        expect(theirs.status).toBe(404);
        expect(db.rows("project_files").map((f) => f.path).sort()).toEqual(
            Object.keys(TEMPLATE_FILES).sort(),
        );
    });

    it("a design that has gone leaves no half-built project behind", async () => {
        const projects = await import("@/app/api/v1/projects/route");

        signedInAs(OWNER);
        const created = await body(
            await projects.POST(
                url("/api/v1/projects", jsonBody("POST", {
                    name: "Ghost",
                    sourceTemplateId: "33333333-3333-4333-8333-000000000009",
                })),
            ),
        );

        expect(created.status).toBe(404);
        expect(db.rows("projects")).toHaveLength(0);
    });

    it("deleting a project never takes down a live site — that is hosting's to end (C-12)", async () => {
        const projects = await import("@/app/api/v1/projects/route");
        const project = await import("@/app/api/v1/projects/[id]/route");

        signedInAs(OWNER);
        const created = await body(
            await projects.POST(url("/api/v1/projects", jsonBody("POST", { name: "Live one" }))),
        );
        const id = created.json.data.id as string;
        db.insert("deployments", { project_id: id, status: "live", live_url: "https://x.pagecraft.in" });

        signedInAs(OWNER);
        await project.DELETE(
            url(`/api/v1/projects/${id}`, jsonBody("DELETE", { email: OWNER_EMAIL, password: OWNER_PASSWORD })),
            params({ id }),
        );

        // Our row is gone. Nothing in this path reached out to the host.
        expect(db.rows("projects")).toHaveLength(0);
    });
});

describe("a second user is denied at every step", () => {
    let id: string;

    beforeEach(async () => {
        const projects = await import("@/app/api/v1/projects/route");
        const files = await import("@/app/api/v1/projects/[id]/files/route");

        signedInAs(OWNER);
        const created = await body(
            await projects.POST(
                url("/api/v1/projects", jsonBody("POST", { name: "Kettle & Co.", sourceTemplateId: TEMPLATE_ID })),
            ),
        );
        id = created.json.data.id as string;

        signedInAs(OWNER);
        await files.PUT(
            url(`/api/v1/projects/${id}/files`, jsonBody("PUT", { files: { "index.html": "<h1>mine</h1>" } })),
            params({ id }),
        );

        const { recordCommit } = await import("@/lib/data/commits");
        await recordCommit(db.asUser(OWNER), id, {
            sha: "b1b2c3d4e5f6789012345678901234567890abcd",
            message: "Mine",
            author: "user",
        });
    });

    it("cannot see it on their dashboard", async () => {
        const projects = await import("@/app/api/v1/projects/route");

        signedInAs(STRANGER);
        const listed = await body(await projects.GET(url("/api/v1/projects")));
        expect(listed.json.data.items).toEqual([]);
    });

    it("cannot read it by its id — a leaked id is not_found, never the row (SEC-14)", async () => {
        const project = await import("@/app/api/v1/projects/[id]/route");

        signedInAs(STRANGER);
        const got = await body(await project.GET(url(`/api/v1/projects/${id}`), params({ id })));
        expect(got.status).toBe(404);
        expect(got.json.error.code).toBe("not_found");
        expect(JSON.stringify(got.json)).not.toContain("Kettle");
    });

    it("cannot read its files, as a tree or one by one", async () => {
        const files = await import("@/app/api/v1/projects/[id]/files/route");
        const file = await import("@/app/api/v1/projects/[id]/files/[...path]/route");

        signedInAs(STRANGER);
        const tree = await body(await files.GET(url(`/api/v1/projects/${id}/files`), params({ id })));
        expect(tree.status).toBe(404);

        signedInAs(STRANGER);
        const one = await body(
            await file.GET(url(`/api/v1/projects/${id}/files/index.html`), params({ id, path: ["index.html"] })),
        );
        expect(one.status).toBe(404);
        expect(JSON.stringify(one.json)).not.toContain("mine");
    });

    it("cannot write into it, and the owner's file is untouched", async () => {
        const file = await import("@/app/api/v1/projects/[id]/files/[...path]/route");

        signedInAs(STRANGER);
        const wrote = await body(
            await file.PUT(
                url(`/api/v1/projects/${id}/files/index.html`, jsonBody("PUT", { content: "<h1>theirs</h1>" })),
                params({ id, path: ["index.html"] }),
            ),
        );

        expect(wrote.status).toBe(404);
        expect(db.rows("project_files").map((r) => r.content)).toEqual(["<h1>mine</h1>"]);
    });

    it("cannot delete its files", async () => {
        const file = await import("@/app/api/v1/projects/[id]/files/[...path]/route");

        signedInAs(STRANGER);
        const gone = await body(
            await file.DELETE(url(`/api/v1/projects/${id}/files/index.html`), params({ id, path: ["index.html"] })),
        );

        expect(gone.status).toBe(404);
        expect(db.rows("project_files")).toHaveLength(1);
    });

    it("cannot patch its content", async () => {
        const content = await import("@/app/api/v1/projects/[id]/content/route");

        signedInAs(STRANGER);
        const patched = await body(
            await content.PATCH(
                url(`/api/v1/projects/${id}/content`, jsonBody("PATCH", {
                    ops: [{ path: "hero.headline", value: "theirs" }],
                })),
                params({ id }),
            ),
        );

        expect(patched.status).toBe(404);
        expect(db.rows("projects")[0]!.content_json ?? {}).not.toMatchObject({
            hero: { headline: "theirs" },
        });
    });

    it("cannot rename or delete the project", async () => {
        const project = await import("@/app/api/v1/projects/[id]/route");

        signedInAs(STRANGER);
        const renamed = await body(
            await project.PATCH(
                url(`/api/v1/projects/${id}`, jsonBody("PATCH", { name: "Theirs now" })),
                params({ id }),
            ),
        );
        expect(renamed.status).toBe(404);
        expect(db.rows("projects")[0]!.name).toBe("Kettle & Co.");

        signedInAs(STRANGER);
        await project.DELETE(
            url(`/api/v1/projects/${id}`, jsonBody("DELETE", { email: STRANGER_EMAIL, password: OWNER_PASSWORD })),
            params({ id }),
        );
        expect(db.rows("projects")).toHaveLength(1);
    });

    it("cannot read its history", async () => {
        const commits = await import("@/app/api/v1/projects/[id]/commits/route");

        signedInAs(STRANGER);
        const history = await body(await commits.GET(url(`/api/v1/projects/${id}/commits`), params({ id })));

        expect(history.status).toBe(404);
        expect(JSON.stringify(history.json)).not.toContain("Mine");
    });

    it("cannot write history into it", async () => {
        const { recordCommit } = await import("@/lib/data/commits");

        await expect(
            recordCommit(db.asUser(STRANGER), id, {
                sha: "c1b2c3d4e5f6789012345678901234567890abcd",
                message: "Theirs",
                author: "user",
            }),
        ).rejects.toMatchObject({ code: "not_found" });

        // The fork's commit and the owner's — the stranger's write added nothing.
        expect(db.rows("commits")).toHaveLength(2);
    });
});
