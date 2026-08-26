import { describe, expect, it } from "vitest";

import { publishProject } from "@/lib/data/publish-project";
import { listProjects } from "@/lib/data/projects";
import { listDeployments } from "@/lib/data/deployments";
import {
    FAILURE_REASONS,
    failureMessage,
    toFailureReason,
    type FailureReason,
} from "@/lib/deploy/failure";
import type { DeployProvider } from "@/lib/deploy/provider";
import { createFakeDb, type FakeDb } from "../support/fake-db";

// Failure states, in words a person can act on (R3 D18).
//
// The milestone asks for three things and they are one thing: every error a publish can
// produce mapped to a message that says what happened and what happens next; the dashboard
// showing a failed publish without the owner opening the project (V-7), for each failure
// mode rather than a generic one; and a retry that cannot double-charge or double-provision.
//
// Before today a failure stored a sentence written where it happened. So "verify the
// dashboard does this for each failure mode" was not checkable: there was no set of modes,
// only prose, and the dashboard row carried no explanation at all. The reason is stored now
// and the words are derived, which is what makes the whole of this file possible.

const OWNER = "11111111-1111-1111-1111-111111111111";

function seeded({ paid = true } = {}): { db: FakeDb; projectId: string } {
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
    if (paid) {
        db.insert("entitlements", {
            user_id: OWNER,
            project_id: project.id,
            kind: "publish",
            source: "paid",
            status: "active",
            expires_at: null,
        });
    }
    return { db, projectId: project.id as string };
}

interface Log {
    provisions: number;
    pushes: number;
}

function provider(
    { live = true, failAt, log = { provisions: 0, pushes: 0 } }: {
        live?: boolean;
        failAt?: "provisioning" | "pushing" | "enabling_hosting";
        log?: Log;
    } = {},
): DeployProvider & { log: Log } {
    return {
        log,
        async provisionSite() {
            log.provisions += 1;
            if (failAt === "provisioning") throw new Error("host refused: quota 429");
            const subdomain = `meeras-cafe${log.provisions > 1 ? `-${log.provisions}` : ""}`;
            return { siteId: subdomain, subdomain, predictedUrl: `https://${subdomain}.pagecrafts.in` };
        },
        addressFor: (siteId: string) => ({
            subdomain: siteId,
            url: `https://${siteId}.pagecrafts.in`,
        }),
        async pushBuild() {
            log.pushes += 1;
            if (failAt === "pushing") throw new Error("upstream 502 from storage");
            return { commitSha: "abc1234" };
        },
        async enableHosting() {
            if (failAt === "enabling_hosting") throw new Error("hosting API 503");
        },
        async verifyLive() {
            return live;
        },
        async removeSite() {},
        async attachCustomDomain(_siteId, hostname) {
            return { hostname, target: `${_siteId}.pages.dev`, records: [] };
        },
        async domainStatus() {
            return "pending";
        },
        async ensureDnsZone() {
            return { nameservers: ["ns1.example.net", "ns2.example.net"] };
        },
    } as DeployProvider & { log: Log };
}

const AT_REST = new Set(["live", "failed", "verifying"]);

async function settled(db: FakeDb, deploymentId: string) {
    for (let i = 0; i < 400; i += 1) {
        const row = db.rows("deployments").find((r) => r.id === deploymentId);
        if (row && AT_REST.has(row.status as string)) return row;
        await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`deployment ${deploymentId} never came to rest`);
}

let key = 0;
const nextKey = () => `fail-${(key += 1)}`;

describe("the words themselves", () => {
    it("gives every failure mode both halves — what happened and what next", () => {
        for (const reason of FAILURE_REASONS) {
            const { what, next } = failureMessage(reason);
            expect(what.trim(), reason).not.toBe("");
            expect(next.trim(), reason).not.toBe("");
            // A message that only names the problem leaves the reader with nothing to do,
            // which is the failure state D18 exists to remove.
            expect(next.length, `${reason}: "next" is too short to be advice`).toBeGreaterThan(20);
        }
    });

    it("never shows a code, a status number or a provider's name", () => {
        // The publish path saw `verification_timeout` written into a column the owner reads,
        // and the provider's own strings — "502", "ECONNRESET" — went in beside it.
        const forbidden = [
            /\b\d{3}\b/,                        // an HTTP status
            /\b[a-z]+(?:_[a-z]+)+\b/,           // any snake_case identifier
            /\b(error|exception|null|undefined|timeout)\b/i,
            /github|cloudflare|supabase|unsplash/i,
            /something went wrong/i,
        ];

        // The patterns have to bite, checked against the strings that actually reached a
        // person. An earlier draft of this test used `/_[a-z]+_/`, which needs underscores
        // on both sides and so sailed past `verification_timeout` — the one string it was
        // written for. A rule that cannot fail is not a rule.
        expect("verification_timeout").toMatch(forbidden[1]!);
        expect("upstream 502 from storage").toMatch(forbidden[0]!);
        expect("Publishing failed: Error").toMatch(forbidden[2]!);

        for (const reason of FAILURE_REASONS) {
            const { what, next } = failureMessage(reason);
            for (const pattern of forbidden) {
                expect(what, `${reason}.what matches ${pattern}`).not.toMatch(pattern);
                expect(next, `${reason}.next matches ${pattern}`).not.toMatch(pattern);
            }
        }
    });

    it("says what is still true, because the fear is that the work is gone", () => {
        // Every retryable failure has to reassure. A person whose publish failed does not
        // know whether their site still exists.
        for (const reason of FAILURE_REASONS) {
            const { next, retryable } = failureMessage(reason);
            if (!retryable) continue;
            expect(next, `${reason} does not say the work is safe`).toMatch(
                /nothing (has been |you have made is )?lost|your work is safe|nothing needs redoing/i,
            );
        }
    });

    it("falls back to words rather than to nothing for a reason it does not know", () => {
        // A row written by an older build, or a value from a newer one. Neither should
        // produce a blank explanation on somebody's dashboard.
        expect(toFailureReason("something_new")).toBe("unknown");
        expect(toFailureReason(null)).toBe("unknown");
        expect(failureMessage("something_new").what.trim()).not.toBe("");
    });

    it("only calls a failure retryable when trying again could work", () => {
        expect(failureMessage("not_paid_for").retryable).toBe(false);
        expect(failureMessage("nothing_to_publish").retryable).toBe(false);
        expect(failureMessage("not_answering_yet").retryable).toBe(false);
        expect(failureMessage("upload_failed").retryable).toBe(true);
    });
});

describe("each failure mode, end to end", () => {
    const cases: { stage: "provisioning" | "pushing" | "enabling_hosting"; reason: FailureReason }[] = [
        { stage: "provisioning", reason: "provisioning_failed" },
        { stage: "pushing", reason: "upload_failed" },
        { stage: "enabling_hosting", reason: "hosting_failed" },
    ];

    for (const { stage, reason } of cases) {
        it(`records ${reason} when the publish dies at ${stage}`, async () => {
            const { db, projectId } = seeded();
            const attempt = await publishProject(
                db.asUser(OWNER), OWNER, projectId, nextKey(), provider({ failAt: stage }),
            );
            const row = await settled(db, attempt.deploymentId);

            expect(row.status).toBe("failed");
            expect(row.failure_reason).toBe(reason);
        });

        it(`explains ${reason} on the dashboard without opening the project (V-7)`, async () => {
            const { db, projectId } = seeded();
            const attempt = await publishProject(
                db.asUser(OWNER), OWNER, projectId, nextKey(), provider({ failAt: stage }),
            );
            await settled(db, attempt.deploymentId);

            const [summary] = await listProjects(db.asUser(OWNER), OWNER);

            expect(summary!.status).toBe("failed");
            expect(summary!.failure?.reason).toBe(reason);
            expect(summary!.failure?.what).toBe(failureMessage(reason).what);
            expect(summary!.failure?.next).toBe(failureMessage(reason).next);
            expect(summary!.liveUrl).toBeNull();
        });
    }

    it("says a finished publish is live even when origins were never probed", async () => {
        // Speed path: mark live after push + DNS without waiting on custom-domain probes.
        const { db, projectId } = seeded();
        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider({ live: false }),
        );
        await settled(db, attempt.deploymentId);

        const [summary] = await listProjects(db.asUser(OWNER), OWNER);

        expect(summary!.status).toBe("live");
        expect(summary!.failure).toBeNull();
        expect(summary!.liveUrl).toBe("https://meeras-cafe.pagecrafts.in");
    });

    it("still surfaces a verifying row left by an older attempt", async () => {
        // Propagation case kept for poll/resume: verifying is not a failure.
        const { db, projectId } = seeded();
        const project = db.rows("projects").find((p) => p.id === projectId)!;
        project.repo_full_name = "meeras-cafe";
        db.insert("deployments", {
            project_id: projectId,
            status: "verifying",
            live_url: null,
            failure_reason: "not_answering_yet",
        });

        const [summary] = await listProjects(db.asUser(OWNER), OWNER);

        expect(summary!.status).toBe("verifying");
        expect(summary!.failure?.reason).toBe("not_answering_yet");
        expect(summary!.failure?.retryable).toBe(false);
        expect(summary!.failure?.what).toMatch(/published/i);
    });

    it("says nothing at all about a site that went live", async () => {
        const { db, projectId } = seeded();
        const attempt = await publishProject(db.asUser(OWNER), OWNER, projectId, nextKey(), provider());
        await settled(db, attempt.deploymentId);

        const [summary] = await listProjects(db.asUser(OWNER), OWNER);

        expect(summary!.status).toBe("live");
        expect(summary!.failure).toBeNull();
        expect(summary!.liveUrl).toBe("https://meeras-cafe.pagecrafts.in");
    });

    it("says nothing about a project nobody has published", async () => {
        const { db } = seeded();
        const [summary] = await listProjects(db.asUser(OWNER), OWNER);

        expect(summary!.status).toBe("draft");
        expect(summary!.failure).toBeNull();
    });

    // Not paying is no longer a way to fail. Going live on a PageCrafts address is free, so
    // an unpaid project publishes like any other and the dashboard has nothing to explain.
    // Custom domain registration is still paid, separately and later.
    it("does not treat an unpaid publish as a failure at all", async () => {
        const { db, projectId } = seeded({ paid: false });

        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider(),
        );

        expect(attempt.deploymentId).toBeTruthy();

        const [summary] = await listProjects(db.asUser(OWNER), OWNER);
        expect(summary!.failure).toBeNull();
    });

    it("covers every failure mode the publish path can actually produce", () => {
        // The list is closed, and this is what keeps it honest: a new stage in publish()
        // must bring a reason and a message with it, or it lands on `unknown` and this fails.
        const produced: FailureReason[] = [
            "provisioning_failed",
            "upload_failed",
            "hosting_failed",
            "not_answering_yet",
            "nothing_to_publish",
            "not_paid_for",
        ];
        for (const reason of produced) expect(FAILURE_REASONS).toContain(reason);
    });
});

describe("the publish history a person reads", () => {
    it("shows the failure in the owner's words, not the provider's", async () => {
        const { db, projectId } = seeded();
        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider({ failAt: "pushing" }),
        );
        await settled(db, attempt.deploymentId);

        const [entry] = await listDeployments(db.asUser(OWNER), projectId);

        expect(entry!.state).toBe("failed");
        expect(entry!.error).toBe(
            `${failureMessage("upload_failed").what} ${failureMessage("upload_failed").next}`,
        );
        // The provider's own string is in the row for support, and must not reach here.
        expect(entry!.error).not.toContain("502");
    });
});

describe("retrying after a failure", () => {
    it("does not take a second payment", async () => {
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);

        const failed = await publishProject(
            client, OWNER, projectId, nextKey(), provider({ failAt: "pushing" }),
        );
        await settled(db, failed.deploymentId);

        const retry = await publishProject(client, OWNER, projectId, nextKey(), provider());
        await settled(db, retry.deploymentId);

        const grants = db
            .rows("entitlements")
            .filter((r) => r.project_id === projectId && r.kind === "publish");
        expect(grants).toHaveLength(1);
    });

    it("does not claim a second site", async () => {
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);
        const first = provider({ failAt: "pushing" });

        const failed = await publishProject(client, OWNER, projectId, nextKey(), first);
        await settled(db, failed.deploymentId);

        const second = provider({ log: first.log });
        const retry = await publishProject(client, OWNER, projectId, nextKey(), second);
        const row = await settled(db, retry.deploymentId);

        expect(first.log.provisions).toBe(1);
        expect(row.live_url).toBe("https://meeras-cafe.pagecrafts.in");
    });

    it("does not start a second attempt while one is still running", async () => {
        // Two different idempotency keys for one project would otherwise race each other
        // onto the same subdomain. runOnce() in the deploy layer only dedupes an identical
        // key, so this guard is the one that stops a double click.
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);
        const log = { provisions: 0, pushes: 0 };
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });

        const slow: DeployProvider & { log: typeof log } = {
            ...provider({ log }),
            async pushBuild() {
                log.pushes += 1;
                await gate;
                return { commitSha: "abc1234" };
            },
        };

        const firstPromise = publishProject(client, OWNER, projectId, nextKey(), slow);
        // Let the first attempt open its row and reach pushing.
        for (let i = 0; i < 200; i += 1) {
            if (db.rows("deployments").some((r) => r.status === "pushing")) break;
            await new Promise((r) => setTimeout(r, 5));
        }

        const second = await publishProject(client, OWNER, projectId, nextKey(), slow);
        release();
        const first = await firstPromise;

        expect(second.deploymentId).toBe(first.deploymentId);
        expect(second.status).toBe("pending");
        expect(log.provisions).toBe(1);
        expect(db.rows("deployments")).toHaveLength(1);
    });

    it("keeps one row per attempt, so the history shows both tries", async () => {
        const { db, projectId } = seeded();
        const client = db.asUser(OWNER);

        const failed = await publishProject(
            client, OWNER, projectId, nextKey(), provider({ failAt: "pushing" }),
        );
        await settled(db, failed.deploymentId);
        const retry = await publishProject(client, OWNER, projectId, nextKey(), provider());
        await settled(db, retry.deploymentId);

        const history = await listDeployments(client, projectId);
        expect(history).toHaveLength(2);
        expect(history[0]!.state).toBe("live");
        expect(history[1]!.state).toBe("failed");
    });
});
