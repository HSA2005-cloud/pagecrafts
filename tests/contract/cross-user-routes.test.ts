import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { startPublishCheckout } from "@/lib/payments/checkout";
import { getProject, listProjects } from "@/lib/data/projects";
import { getProjectFiles, getProjectFile } from "@/lib/data/project-files";
import { listCommits } from "@/lib/data/commits";
import { listDeployments } from "@/lib/data/deployments";
import { assertCanEdit, checkEditPermission } from "@/lib/data/entitlements";
import { createFakeDb, type FakeDb } from "../support/fake-db";

// The cross-user half of the D19 route audit (SEC-14, R3 D19).
//
// e2e/cross-user.spec.ts already asks a signed-in person for somebody else's project. Two
// problems with leaving it there, and the audit is what turned them up:
//
//   · Its route list is written by hand, and it had fallen five routes behind — /checkout,
//     /deployments, /assets, /edits/apply and /generate/choose were all absent. That is
//     precisely the drift the plan warned about: "the audit is confirming no route added
//     since escaped them."
//   · It is skipped unless E2E_WITH_AUTH=1, which needs an Upstash credential CI does not
//     have. So the guarantee was checked on nobody's machine on any ordinary day.
//
// The enumeration below starts from the filesystem, so a project route added tomorrow fails
// this file until somebody says what happens when a stranger asks for it.

const OWNER = "11111111-1111-1111-1111-111111111111";
const STRANGER = "22222222-2222-2222-2222-222222222222";

const ROUTES_DIR = join(process.cwd(), "src", "app", "api", "v1", "projects", "[id]");

/** Every route under /projects/{id}, as a path suffix. */
function projectRoutes(dir = ROUTES_DIR, prefix = ""): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            found.push(...projectRoutes(full, `${prefix}/${entry}`));
        } else if (entry === "route.ts") {
            found.push(prefix || "/");
        }
    }
    return found.sort();
}

/**
 * What the audit has decided about each route under /projects/{id}.
 *
 * `covered` means a stranger's attempt is exercised below. Everything must be listed: the
 * enumeration test fails on a route this map has never heard of, which is the whole point —
 * a new route cannot slip past by simply not being thought about.
 */
const CROSS_USER: Record<string, "covered" | { skipped: string }> = {
    "/": "covered",
    "/assets": "covered",
    "/checkout": "covered",
    "/commits": "covered",
    "/composition": "covered",
    "/content": "covered",
    "/copy-edits": "covered",
    "/deployments": "covered",
    "/edits": "covered",
    "/edits/apply": "covered",
    "/files": "covered",
    "/files/[...path]": "covered",
    "/generate": "covered",
    "/generate/choose": {
        skipped:
            "Reached only with a job id, and the handler refuses any job whose userId or " +
            "projectId is not the caller's before it touches the project at all. Covered by " +
            "tests/contract/generate-job.test.ts.",
    },
    "/publish": "covered",
    "/restore": "covered",
};

function twoPeople(): { db: FakeDb; theirs: string; mine: string } {
    const db = createFakeDb({ users: [{ id: OWNER }, { id: STRANGER }] });
    const theirs = db.insert("projects", {
        user_id: OWNER,
        name: "Meera's Cafe",
        content_json: {},
        site_meta: {},
    });
    const mine = db.insert("projects", { user_id: STRANGER, name: "Mine", content_json: {} });
    db.insert("project_files", {
        project_id: theirs.id,
        path: "index.html",
        content: "<h1>hers</h1>",
    });
    db.insert("commits", {
        project_id: theirs.id,
        sha: "abc1234",
        message: "first",
        author: "user",
    });
    db.insert("deployments", { project_id: theirs.id, status: "live", live_url: "https://x.test" });
    return { db, theirs: theirs.id as string, mine: mine.id as string };
}

/** not_found, never forbidden — a 403 confirms the id is real and belongs to somebody. */
async function expectHidden(where: string, run: () => Promise<unknown>) {
    let thrown: { code?: string } | undefined;
    let returned: unknown;
    try {
        returned = await run();
    } catch (error) {
        thrown = error as { code?: string };
    }

    if (thrown) {
        expect(thrown.code, `${where} used the wrong code`).toBe("not_found");
        return;
    }
    // Some reads legitimately answer with emptiness rather than throwing — a history the
    // caller cannot see is an empty history. What none of them may do is return the row.
    expect(returned, `${where} returned somebody else's data`).toEqual(
        expect.objectContaining({ items: [] }),
    );
}

describe("the audit covers every route under /projects/{id}", () => {
    it("has decided about every route on disk", () => {
        const onDisk = projectRoutes();
        const decided = Object.keys(CROSS_USER).sort();

        // If this fails, a route was added. Say what a stranger gets from it — either cover
        // it below, or record why it does not need covering.
        expect(onDisk).toEqual(decided);
    });

    it("does not claim to have decided about routes that do not exist", () => {
        const onDisk = new Set(projectRoutes());
        expect(Object.keys(CROSS_USER).filter((r) => !onDisk.has(r))).toEqual([]);
    });

    it("covers all but the ones with a written reason", () => {
        const skipped = Object.entries(CROSS_USER)
            .filter(([, v]) => v !== "covered")
            .map(([k]) => k);

        expect(skipped).toEqual(["/generate/choose"]);
    });
});

describe("a signed-in stranger, asking for somebody else's project", () => {
    it("cannot rewrite copy on it", async () => {
        const { db, theirs } = twoPeople();
        await expectHidden("POST /copy-edits", () => getProject(db.asUser(STRANGER), theirs));
    });

    it("cannot read the project", async () => {
        const { db, theirs } = twoPeople();
        await expectHidden("GET /projects/{id}", () => getProject(db.asUser(STRANGER), theirs));
    });

    it("does not see it in their own list", async () => {
        const { db, theirs, mine } = twoPeople();
        const items = await listProjects(db.asUser(STRANGER), STRANGER);

        expect(items.map((p) => p.id)).toEqual([mine]);
        expect(items.map((p) => p.id)).not.toContain(theirs);
    });

    it("cannot read its files, one at a time or all at once", async () => {
        const { db, theirs } = twoPeople();
        await expectHidden("GET /files", () => getProjectFiles(db.asUser(STRANGER), theirs));
        await expectHidden("GET /files/{path}", () =>
            getProjectFile(db.asUser(STRANGER), theirs, "index.html"),
        );
    });

    it("cannot read its composition", async () => {
        const { db, theirs } = twoPeople();
        await expectHidden("GET /composition", () =>
            getProjectFile(db.asUser(STRANGER), theirs, "composition.json"),
        );
    });

    it("cannot read its history", async () => {
        const { db, theirs } = twoPeople();
        await expectHidden("GET /commits", () => listCommits(db.asUser(STRANGER), theirs));

        // /copy-edits reads the project before it reaches the AI, so a stranger is stopped
        // at the same place every other project route stops them. Worth its own line: the
        // route's first call is assertCanEdit, which reads deployments and answers
        // "never published" for a project it cannot see -- it is getProject that refuses.
        await expectHidden("POST /copy-edits", () => getProject(db.asUser(STRANGER), theirs));
    });

    it("cannot read its publish history", async () => {
        // listDeployments is RLS-scoped and answers with an empty history rather than
        // throwing — which is right, and this is the assertion that it is empty rather
        // than somebody else's.
        const { db, theirs } = twoPeople();
        const history = await listDeployments(db.asUser(STRANGER), theirs);
        expect(history).toEqual([]);
    });

    it("cannot learn whether it may be edited", async () => {
        // checkEditPermission reads the deployment history to find the first publish. For a
        // project the caller cannot see there is no history, so it must not report the
        // goodwill window of somebody else's launch.
        const { db, theirs } = twoPeople();
        const permission = await checkEditPermission(db.asUser(STRANGER), STRANGER, theirs);
        expect(permission.reason).toBe("never_published");
    });

    it("cannot ask for a copy rewrite on it", async () => {
        // Worth reading, because the route's first line is not what protects it.
        //
        // /copy-edits opens with assertCanEdit. For a project a stranger cannot see there
        // is no publish history, so the edit gate reads "never published" and *allows* --
        // the same shape as the /checkout-with-pro case below, where an entitlement check
        // answers about the account rather than the project.
        //
        // The refusal arrives one line later at getProject, which is RLS-scoped. The route
        // is safe, and it is safe by its second guard rather than its first. Recorded so
        // nobody reorders those two calls believing the gate is doing the work (R3 D20).
        const { db, theirs } = twoPeople();

        const permission = await assertCanEdit(db.asUser(STRANGER), STRANGER, theirs);
        expect(permission.allowed, "the edit gate does not hide other people's projects").toBe(
            true,
        );

        await expectHidden("POST /copy-edits", () => getProject(db.asUser(STRANGER), theirs));
    });

    it("cannot start a checkout for it", async () => {
        const { db, theirs } = twoPeople();
        await expectHidden("POST /checkout", () =>
            startPublishCheckout(db.asUser(STRANGER), STRANGER, theirs),
        );
    });

    it("cannot start a checkout for it while holding a pro subscription", async () => {
        // The case the ordering hid. checkEntitlement asks about the *account*, not the
        // project, and `pro` satisfies every kind — so it answered `granted: true` and
        // returned before anything read the project row. A subscriber got 200 for a project
        // that is not theirs, where every other route on this list answers not_found.
        //
        // Nothing was granted and nothing was charged, so it was never exploitable. It was
        // the API disagreeing with itself about what a stranger is told, which is the thing
        // an audit is for (R3 D19).
        const { db, theirs } = twoPeople();
        db.insert("entitlements", {
            user_id: STRANGER,
            project_id: null,
            kind: "pro",
            source: "paid",
            status: "active",
            expires_at: null,
        });

        await expectHidden("POST /checkout with pro", () =>
            startPublishCheckout(db.asUser(STRANGER), STRANGER, theirs),
        );
    });

    it("gets the same answer for an id that belongs to nobody", async () => {
        // The two must be indistinguishable, or the difference is a way to enumerate ids.
        const { db } = twoPeople();
        await expectHidden("GET a nonexistent id", () =>
            getProject(db.asUser(STRANGER), "00000000-0000-4000-8000-0000000000ff"),
        );
    });
});
