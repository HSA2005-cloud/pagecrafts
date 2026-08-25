import { describe, expect, it, vi } from "vitest";

import { publishProject, resumeVerification } from "@/lib/data/publish-project";
import { assertCanPublish, checkEntitlement } from "@/lib/data/entitlements";
import { getDeployment } from "@/lib/data/deployments";
import type { DeployProvider } from "@/lib/deploy/provider";
import { createFakeDb, type FakeDb } from "../support/fake-db";

// What persistence owes the four publish edge cases (R3 D17).
//
// The hosting track's week 4 is subdomain collision, propagation timeout, failure after
// payment, and credential rotation. None of those are hosting problems alone — each one is
// only survivable if something on this side remembered the right fact:
//
//   collision   → the site id, kept even when the attempt that claimed it failed
//   propagation → an attempt that can rest mid-verification and be picked up again
//   payment     → an entitlement that is read on retry, never re-granted
//   rotation    → nothing stored that ties a deployment to one credential
//
// The third is the one that must not be got wrong. Somebody who has paid, whose publish then
// failed, must never be asked to pay again.

const OWNER = "11111111-1111-1111-1111-111111111111";

function seeded(): { db: FakeDb; projectId: string } {
    const db = createFakeDb({ users: [{ id: OWNER }] });
    const project = db.insert("projects", {
        user_id: OWNER,
        name: "Meera's Cafe",
        content_json: {},
        site_meta: {},
    });
    db.insert("project_files", {
        project_id: project.id,
        path: "index.html",
        content: "<!doctype html><html><body><h1>Cafe</h1></body></html>",
    });
    db.insert("entitlements", {
        user_id: OWNER,
        project_id: project.id,
        kind: "publish",
        source: "paid",
        status: "active",
        expires_at: null,
    });
    return { db, projectId: project.id as string };
}

interface Log {
    provisions: number;
    pushes: number;
    verifies: string[];
}

function provider(
    { live = true, failAt, log = { provisions: 0, pushes: 0, verifies: [] } }: {
        live?: boolean;
        failAt?: "pushing";
        log?: Log;
    } = {},
): DeployProvider & { log: Log } {
    return {
        log,
        async provisionSite() {
            log.provisions += 1;
            const subdomain = `meeras-cafe${log.provisions > 1 ? `-${log.provisions}` : ""}`;
            return {
                siteId: subdomain,
                subdomain,
                predictedUrl: `https://${subdomain}.pagecrafts.in`,
            };
        },
        addressFor(siteId: string) {
            return { subdomain: siteId, url: `https://${siteId}.pagecrafts.in` };
        },
        async pushBuild() {
            log.pushes += 1;
            if (failAt === "pushing") throw new Error("upstream 502");
            return { commitSha: "abc1234" };
        },
        async enableHosting() {},
        async verifyLive(url: string) {
            log.verifies.push(url);
            return live;
        },
        async removeSite() {},
    } as DeployProvider & { log: Log };
}

// publishProject awaits host work, so the row is usually already at rest when it returns.
// settled() still covers any finish() write that lands a tick later.
const AT_REST = new Set(["live", "failed", "verifying"]);

async function settled(db: FakeDb, deploymentId: string) {
    for (let i = 0; i < 400; i += 1) {
        const row = db.rows("deployments").find((r) => r.id === deploymentId);
        if (row && AT_REST.has(row.status as string)) return row;
        await new Promise((r) => setTimeout(r, 5));
    }
    const last = db.rows("deployments").find((r) => r.id === deploymentId);
    throw new Error(`deployment ${deploymentId} never came to rest (stuck at ${last?.status})`);
}

/** Legacy / poll path: an attempt that finished push+DNS but never got an origin answer. */
function seedVerifying(db: FakeDb, projectId: string) {
    const project = db.rows("projects").find((p) => p.id === projectId)!;
    project.repo_full_name = "meeras-cafe";
    return db.insert("deployments", {
        project_id: projectId,
        status: "verifying",
        live_url: null,
        failure_reason: "not_answering_yet",
        commit_sha: "abc1234",
    });
}

let key = 0;
const nextKey = () => `edge-${(key += 1)}`;

describe("failure after payment", () => {
    it("leaves the entitlement granted when the publish fails", async () => {
        // The rule the whole payment story rests on. A failed publish must not consume,
        // revoke or expire what the person bought.
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);

        const started = await publishProject(
            client, OWNER, projectId, nextKey(), provider({ failAt: "pushing" }),
        );
        await settled(db, started.deploymentId);

        const after = await checkEntitlement(client, OWNER, projectId, "publish");
        expect(after.granted).toBe(true);
        expect(after.source).toBe("paid");
    });

    it("lets the retry through without a second payment", async () => {
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);

        const failed = await publishProject(
            client, OWNER, projectId, nextKey(), provider({ failAt: "pushing" }),
        );
        await settled(db, failed.deploymentId);

        // The gate throws payment_required when it is not satisfied, so simply returning is
        // the assertion: the retry is allowed on the grant the first attempt was made under.
        await expect(assertCanPublish(client, OWNER, projectId)).resolves.toMatchObject({
            granted: true,
        });

        const retry = await publishProject(client, OWNER, projectId, nextKey(), provider());
        expect(retry.status).toBe("live");
    });

    it("still holds exactly one entitlement row after several attempts", async () => {
        // A retry that quietly re-granted would look identical from the outside and show up
        // only as a second charge on somebody's card.
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);

        for (let i = 0; i < 3; i += 1) {
            const attempt = await publishProject(
                client, OWNER, projectId, nextKey(), provider({ failAt: "pushing" }),
            );
            await settled(db, attempt.deploymentId);
        }

        const rows = db
            .rows("entitlements")
            .filter((r) => r.project_id === projectId && r.kind === "publish");
        expect(rows).toHaveLength(1);
    });

    // Going live on a PageCrafts address is free (assertCanPublish, "Modified Publishing").
    // The gate no longer refuses — it writes the grant so the host step can proceed, and the
    // grant is recorded rather than assumed, so the row says why this publish was allowed.
    it("lets somebody who has paid nothing go live, and records why", async () => {
        const db = createFakeDb({ users: [{ id: OWNER }] });
        const project = db.insert("projects", { user_id: OWNER, name: "Unpaid" });
        db.insert("project_files", { project_id: project.id, path: "index.html", content: "<p>hi</p>" });

        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, project.id as string, nextKey(),
        );

        expect(attempt.deploymentId).toBeTruthy();
        expect(db.rows("deployments")).toHaveLength(1);

        const grants = db
            .rows("entitlements")
            .filter((r) => r.project_id === project.id && r.kind === "publish");
        expect(grants).toHaveLength(1);
        expect(grants[0]!.source).toBe("launch_offer");
    });
});

describe("a publish that fails after the site was claimed", () => {
    it("remembers the site so the retry does not claim a second one", async () => {
        // The collision case, end to end through the data layer. Without this the retry
        // re-derives the address from the project name, the host reports it taken — by the
        // site we abandoned a moment ago — and the person's site moves to `-2`.
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);
        const failing = provider({ failAt: "pushing" });

        const attempt = await publishProject(client, OWNER, projectId, nextKey(), failing);
        await settled(db, attempt.deploymentId);

        const project = db.rows("projects").find((p) => p.id === projectId);
        expect(project?.repo_full_name).toBe("meeras-cafe");

        const working = provider({ log: failing.log });
        const retry = await publishProject(client, OWNER, projectId, nextKey(), working);
        const row = await settled(db, retry.deploymentId);

        expect(failing.log.provisions).toBe(1);
        expect(row.status).toBe("live");
        expect(row.live_url).toBe("https://meeras-cafe.pagecrafts.in");
    });

    it("records why it failed, and keeps the provider's words out of the owner's way", async () => {
        // Two columns, two audiences (R3 D18). `failure_reason` is what the owner is told,
        // by way of lib/deploy/failure.ts; `error` is the redacted provider detail, kept for
        // whoever has to work out what happened and never shown.
        const { db, projectId } = seeded();
        const failing = provider({ failAt: "pushing" });

        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), failing,
        );
        const row = await settled(db, attempt.deploymentId);

        expect(row.status).toBe("failed");
        expect(row.failure_reason).toBe("upload_failed");
        expect(String(row.error)).toContain("502");
    });
});

describe("a publish after push (no origin wait)", () => {
    it("marks live immediately without a second origin poll", async () => {
        // pushBuild already confirmed Pages; re-probing the custom domain burned 5–8s.
        const { db, projectId } = seeded();
        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider({ live: false }),
        );
        const row = await settled(db, attempt.deploymentId);

        expect(attempt.status).toBe("live");
        expect(row.status).toBe("live");
        expect(row.live_url).toBe("https://meeras-cafe.pagecrafts.in");
    });
});

describe("resuming a verifying attempt", () => {
    // Older rows (and the poll route) can still rest in verifying. resumeVerification
    // remains the cheap path that promotes them without re-provisioning.

    it("does not hand out a URL for a site that is not answering yet", async () => {
        // C-05. A verifying attempt has a predicted address, and showing it would send
        // somebody to a page that is not there.
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);
        const row = seedVerifying(db, projectId);

        const view = await getDeployment(client, row.id as string);
        expect(view?.state).toBe("verifying");
        expect(view?.liveUrl).toBeNull();
    });

    it("goes live on a later check, without provisioning or pushing again", async () => {
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);
        const row = seedVerifying(db, projectId);
        const log = { provisions: 0, pushes: 0, verifies: [] as string[] };

        const state = await resumeVerification(
            client, row.id as string, provider({ live: true, log }),
        );

        expect(state).toBe("live");
        expect(log.provisions).toBe(0);
        expect(log.pushes).toBe(0);
        expect(log.verifies).toEqual(["https://meeras-cafe.pagecrafts.in"]);

        const view = await getDeployment(client, row.id as string);
        expect(view?.liveUrl).toBe("https://meeras-cafe.pagecrafts.in");
    });

    it("leaves the attempt alone when the site is still not there", async () => {
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);
        const row = seedVerifying(db, projectId);
        const again = provider({ live: false });

        expect(await resumeVerification(client, row.id as string, again)).toBe("verifying");
        expect(await resumeVerification(client, row.id as string, again)).toBe("verifying");
        expect(again.log.provisions).toBe(0);
    });

    it("does not fail the attempt when the check itself errors", async () => {
        // A host that is unreachable is not evidence the site is missing. Marking it failed
        // would throw away a publish that had done everything but get an answer.
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);
        const row = seedVerifying(db, projectId);

        const broken = provider();
        vi.spyOn(broken, "verifyLive").mockRejectedValue(new Error("ECONNRESET"));

        expect(await resumeVerification(client, row.id as string, broken)).toBe("verifying");
    });

    it("does nothing to an attempt that already finished", async () => {
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);

        const attempt = await publishProject(client, OWNER, projectId, nextKey(), provider());
        await settled(db, attempt.deploymentId);

        const p = provider();
        const verify = vi.spyOn(p, "verifyLive");
        expect(await resumeVerification(client, attempt.deploymentId, p)).toBe("live");
        expect(verify).not.toHaveBeenCalled();
    });

    it("will not resume somebody else's attempt", async () => {
        const { db, projectId } = seeded();
        const stranger = "22222222-2222-2222-2222-222222222222";
        db.insert("users", { id: stranger });

        const row = seedVerifying(db, projectId);

        await expect(
            resumeVerification(db.asUser(stranger), row.id as string, provider()),
        ).rejects.toMatchObject({ code: "not_found" });
    });
});

describe("credential rotation", () => {
    it("stores nothing about the credential that performed a deployment", async () => {
        // A deployment row that named a key, a token or a credential version would stop
        // working the moment that credential was rotated — and would be a secret at rest in
        // a table the owner can read. The row holds where the site is and how it went; the
        // credential belongs to the request that used it.
        const { db, projectId } = seeded();

        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider(),
        );
        await settled(db, attempt.deploymentId);

        const row = db.rows("deployments").find((r) => r.id === attempt.deploymentId)!;
        const stored = JSON.stringify(row).toLowerCase();
        for (const word of ["token", "secret", "credential", "key_id", "apikey", "bearer"]) {
            expect(stored, `deployments row mentions "${word}"`).not.toContain(word);
        }
    });

    it("keeps the project's memory of its site to an id, not a credentialled URL", async () => {
        // repo_full_name is what a republish reuses. If it held anything issued by a
        // credential — a signed URL, an account-scoped handle — rotating that credential
        // would strand every existing site.
        const { db, projectId } = seeded();

        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider(),
        );
        await settled(db, attempt.deploymentId);

        const project = db.rows("projects").find((p) => p.id === projectId)!;
        expect(project.repo_full_name).toBe("meeras-cafe");
        expect(String(project.repo_full_name)).not.toMatch(/[?&](token|key|sig)=/i);
    });
});
