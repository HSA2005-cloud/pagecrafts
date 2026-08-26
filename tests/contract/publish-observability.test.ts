import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EVENTS } from "@/lib/observability/events";
import type { DeployProvider } from "@/lib/deploy/provider";
import { createFakeDb, type FakeDb } from "../support/fake-db";

// Can the publish funnel be watched? (R3 D20)
//
// D20's job on this track is "watch the publish funnel and Sentry; triage without shipping",
// and the audit that went with it found there was nothing to watch. The event catalogue held
// five events — landing, sign-in, generate — and not one for publish, the funnel that takes
// money and the one the whole of week 4 was about. Worse, a *failed* publish reached
// neither: it runs after the response as a detached promise, so withRoute's Sentry boundary
// never sees it, and the catch wrote one console line. On launch day the first anybody would
// know of a bad deploy was a customer saying so.
//
// These hold the instrumentation to the thing support actually needs to answer: how many
// publishes, how many failed, why, and for whom.

const OWNER = "11111111-1111-1111-1111-111111111111";

const captured = vi.hoisted(() => ({ events: [] as { id: string; distinctId: string; props: Record<string, unknown> }[] }));
const sentry = vi.hoisted(() => ({ errors: [] as { tags?: Record<string, string>; extra?: Record<string, unknown> }[] }));

vi.mock("@/lib/observability/analytics", () => ({
    track: (id: string, distinctId: string, props: Record<string, unknown> = {}) => {
        captured.events.push({ id, distinctId, props });
    },
    capture: async () => {},
    isAnalyticsEnabled: () => true,
}));

vi.mock("@/lib/observability/capture", () => ({
    captureError: (_error: unknown, context: { tags?: Record<string, string>; extra?: Record<string, unknown> } = {}) => {
        sentry.errors.push(context);
    },
}));

beforeEach(() => {
    captured.events = [];
    sentry.errors = [];
});

afterEach(() => {
    vi.restoreAllMocks();
});

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

function provider({ live = true, failAt }: { live?: boolean; failAt?: "pushing" } = {}): DeployProvider {
    return {
        async provisionSite() {
            return {
                siteId: "meeras-cafe",
                subdomain: "meeras-cafe",
                predictedUrl: "https://meeras-cafe.pagecrafts.in",
            };
        },
        addressFor: (siteId: string) => ({
            subdomain: siteId,
            url: `https://${siteId}.pagecrafts.in`,
        }),
        async pushBuild() {
            if (failAt === "pushing") throw new Error("upstream 502 from storage");
            return { commitSha: "abc1234" };
        },
        async enableHosting() {},
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
    } as DeployProvider;
}

const AT_REST = new Set(["live", "failed", "verifying"]);

async function settled(db: FakeDb, deploymentId: string) {
    for (let i = 0; i < 400; i += 1) {
        const row = db.rows("deployments").find((r) => r.id === deploymentId);
        if (row && AT_REST.has(row.status as string)) return row;
        await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error("the attempt never came to rest");
}

let key = 0;
const nextKey = () => `obs-${(key += 1)}`;

/** Imported inside each test so the mocks above are installed first. */
async function publishProject(...args: Parameters<typeof import("@/lib/data/publish-project")["publishProject"]>) {
    const mod = await import("@/lib/data/publish-project");
    return mod.publishProject(...args);
}

describe("the event catalogue", () => {
    it("has an event for each end of the publish funnel", () => {
        expect(Object.values(EVENTS)).toEqual(
            expect.arrayContaining(["publish_started", "publish_completed", "publish_failed"]),
        );
    });
});

describe("a publish that goes live", () => {
    it("is counted at both ends", async () => {
        const { db, projectId } = seeded();
        const started = await publishProject(db.asUser(OWNER), OWNER, projectId, nextKey(), provider());
        await settled(db, started.deploymentId);

        const ids = captured.events.map((e) => e.id);
        expect(ids).toContain("EV-06");
        expect(ids).toContain("EV-07");
        expect(ids).not.toContain("EV-08");
    });

    it("records live when the host work finished without an origin wait", async () => {
        const { db, projectId } = seeded();
        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider({ live: false }),
        );
        await settled(db, attempt.deploymentId);

        const done = captured.events.find((e) => e.id === "EV-07");
        expect(done?.props.state).toBe("live");
        expect(done?.props.reason).toBeNull();
    });

    it("distinguishes a first publish from a republish", async () => {
        const { db, projectId } = seeded();
        const first = await publishProject(db.asUser(OWNER), OWNER, projectId, nextKey(), provider());
        await settled(db, first.deploymentId);

        captured.events = [];
        const again = await publishProject(db.asUser(OWNER), OWNER, projectId, nextKey(), provider());
        await settled(db, again.deploymentId);

        expect(captured.events.find((e) => e.id === "EV-06")?.props.republish).toBe(true);
    });
});

describe("a publish that fails", () => {
    it("reaches Sentry, tagged with why", async () => {
        // The gap this file exists for. The work runs after the response, so nothing
        // upstream is watching; before D20 the only trace was a console line.
        const { db, projectId } = seeded();
        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider({ failAt: "pushing" }),
        );
        await settled(db, attempt.deploymentId);

        expect(sentry.errors).toHaveLength(1);
        expect(sentry.errors[0]!.tags).toMatchObject({
            boundary: "publish",
            reason: "upload_failed",
        });
    });

    it("carries enough to find the attempt", async () => {
        // A Sentry issue that cannot be tied back to a deployment row is a shrug with a
        // stack trace attached.
        const { db, projectId } = seeded();
        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider({ failAt: "pushing" }),
        );
        await settled(db, attempt.deploymentId);

        expect(sentry.errors[0]!.extra).toMatchObject({
            projectId,
            deploymentId: attempt.deploymentId,
        });
    });

    it("is counted with the same reason the owner is shown", async () => {
        // One vocabulary. The reason on the dashboard, in the row and in the funnel is the
        // same value, so "eleven upload_failed today" and what those eleven people were
        // told cannot drift apart.
        const { db, projectId } = seeded();
        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider({ failAt: "pushing" }),
        );
        const row = await settled(db, attempt.deploymentId);

        const failed = captured.events.find((e) => e.id === "EV-08");
        expect(failed?.props.reason).toBe("upload_failed");
        expect(row.failure_reason).toBe(failed?.props.reason);
    });

    it("counts a start even when it does not finish", async () => {
        // Otherwise the funnel's denominator is only the successes and the failure rate is
        // always zero.
        const { db, projectId } = seeded();
        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider({ failAt: "pushing" }),
        );
        await settled(db, attempt.deploymentId);

        expect(captured.events.filter((e) => e.id === "EV-06")).toHaveLength(1);
        expect(captured.events.filter((e) => e.id === "EV-08")).toHaveLength(1);
    });
});

describe("what the events are allowed to carry", () => {
    it("never sends the owner's words, files or address", async () => {
        // analytics.ts refuses a property whose *name* looks like user text. This is the
        // other half: the values. A site name or a live URL in an analytics payload is
        // customer data in a third-party system nobody agreed to.
        const { db, projectId } = seeded();
        const attempt = await publishProject(db.asUser(OWNER), OWNER, projectId, nextKey(), provider());
        await settled(db, attempt.deploymentId);

        const serialised = JSON.stringify(captured.events.map((e) => e.props));
        for (const secret of ["Meera", "meeras-cafe", "pagecrafts.in", "<h1>", "index.html"]) {
            expect(serialised, `an event carried "${secret}"`).not.toContain(secret);
        }
    });

    it("identifies the person by id and nothing else", async () => {
        const { db, projectId } = seeded();
        const attempt = await publishProject(db.asUser(OWNER), OWNER, projectId, nextKey(), provider());
        await settled(db, attempt.deploymentId);

        for (const event of captured.events) {
            expect(event.distinctId).toBe(OWNER);
        }
    });
});

describe("a publish by somebody who has paid nothing", () => {
    it("counts as an ordinary publish, because that is what it now is", async () => {
        // Going live on a PageCrafts address is free, so this is no longer turned away at
        // the gate. It has to appear in the funnel like any other publish — leaving it out
        // would hide most of the traffic during the launch offer.
        const { db, projectId } = seeded({ paid: false });

        const attempt = await publishProject(
            db.asUser(OWNER), OWNER, projectId, nextKey(), provider(),
        );
        await settled(db, attempt.deploymentId);

        const ids = captured.events.map((e) => e.id);
        expect(ids).toContain("EV-06");
        expect(ids).toContain("EV-07");
        expect(sentry.errors).toEqual([]);
    });
});
