import { describe, expect, it, vi, beforeEach } from "vitest";

import { fakeSupabase, none, row, type TableResponder } from "../support/fake-supabase";

// Publishing, as the seam between entitlements, the build and the provider (R3 D15).
//
// publish() itself is covered by tests/unit/deploy/*; what is untested until now is the
// decision layer around it — who may publish, what is written before the response, and what
// the row says when the provider work finishes or fails afterwards.

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const DEPLOYMENT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "u_1";
const KEY = "idem-1";

const deploy = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock("@/lib/deploy/publish", () => ({ publish: deploy.publish }));

const inputs = vi.hoisted(() => ({ projectPublishInputs: vi.fn() }));
vi.mock("@/lib/deploy/publishable", () => ({ projectPublishInputs: inputs.projectPublishInputs }));

const gate = vi.hoisted(() => ({ assertCanPublish: vi.fn() }));
vi.mock("@/lib/data/entitlements", () => ({ assertCanPublish: gate.assertCanPublish }));

const FILES = [{ path: "index.html", content: "<h1>hi</h1>", encoding: "utf-8" as const }];

/**
 * projects answers the repo_full_name read; deployments answers the insert and updates,
 * and answers *reads* with nothing.
 *
 * That last part is the whole of a four-test outage. D18 moved the "is a publish already
 * running?" guard out of the route and into publishProject, and this fake had been
 * answering every deployments query -- reads included -- with a row. So openDeployment
 * found a publish in flight on every call, publishProject returned early, and the provider
 * was never reached. Four tests went quiet at once, among them both of the ones that hold
 * FR-087: that a retry is one site and not two, and that a failure lands on the row.
 *
 * They did not fail loudly enough to stop anyone, which is the part worth remembering. A
 * fake that says yes to everything will happily agree that nothing happened.
 */
function tables(repoFullName: string | null = null): Record<string, TableResponder> {
    return {
        projects: row({ id: PROJECT_ID, repo_full_name: repoFullName }),
        deployments: (query) => {
            // openDeployment selects in-flight rows. A blanket `row()` would make every
            // publish look already running and never call the provider.
            if (query.op === "select") {
                return { data: query.shape === "many" ? [] : null, error: null };
            }
            return row({ id: DEPLOYMENT_ID })(query);
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    gate.assertCanPublish.mockResolvedValue({ granted: true });
    inputs.projectPublishInputs.mockResolvedValue({ projectName: "Kettle & Co.", files: FILES });
    deploy.publish.mockResolvedValue({
        siteId: "pagecraft/kettle-co",
        subdomain: "kettle-co",
        liveUrl: "https://kettle-co.pagecrafts.in",
        commitSha: "a".repeat(40),
        state: "live",
        error: null,
    });
});

describe("publishProject", () => {
    it("answers with the finished deployment once the host work is done", async () => {
        const fake = fakeSupabase(tables());
        const { publishProject } = await import("@/lib/data/publish-project");

        const result = await publishProject(fake.client, USER_ID, PROJECT_ID, KEY);

        expect(result).toEqual({
            deploymentId: DEPLOYMENT_ID,
            status: "live",
            liveUrl: "https://kettle-co.pagecrafts.in",
        });
    });

    it("refuses before recording anything when publishing is not paid for", async () => {
        gate.assertCanPublish.mockRejectedValue(
            Object.assign(new Error("payment"), { code: "payment_required" }),
        );

        const fake = fakeSupabase(tables());
        const { publishProject } = await import("@/lib/data/publish-project");

        await expect(publishProject(fake.client, USER_ID, PROJECT_ID, KEY)).rejects.toMatchObject({
            code: "payment_required",
        });

        // No row, no provider call: a publish nobody paid for costs nothing and leaves no
        // trace in the dashboard.
        expect(fake.queries.filter((q) => q.table === "deployments")).toEqual([]);
        expect(deploy.publish).not.toHaveBeenCalled();
    });

    it("refuses a project with nothing in it", async () => {
        inputs.projectPublishInputs.mockResolvedValue({ projectName: "Empty", files: [] });

        const fake = fakeSupabase(tables());
        const { publishProject } = await import("@/lib/data/publish-project");

        await expect(publishProject(fake.client, USER_ID, PROJECT_ID, KEY)).rejects.toMatchObject({
            code: "validation_failed",
        });
        expect(deploy.publish).not.toHaveBeenCalled();
    });

    it("cannot publish a project it cannot see (SEC-14)", async () => {
        const fake = fakeSupabase({ projects: none, deployments: row({ id: DEPLOYMENT_ID }) });
        const { publishProject } = await import("@/lib/data/publish-project");

        await expect(publishProject(fake.client, USER_ID, PROJECT_ID, KEY)).rejects.toMatchObject({
            code: "not_found",
        });
    });

    it("carries the idempotency key through, so a retry is one site and not two (FR-087)", async () => {
        const fake = fakeSupabase(tables());
        const { publishProject } = await import("@/lib/data/publish-project");

        await publishProject(fake.client, USER_ID, PROJECT_ID, KEY);

        expect(deploy.publish).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: PROJECT_ID, files: FILES, idempotencyKey: KEY }),
            expect.any(Function),
            expect.anything(),
        );
    });

    it("republishes into the site it already has rather than provisioning another", async () => {
        const fake = fakeSupabase(tables("pagecraft/kettle-co"));
        const { publishProject } = await import("@/lib/data/publish-project");

        await publishProject(fake.client, USER_ID, PROJECT_ID, KEY);

        expect(deploy.publish).toHaveBeenCalledWith(
            expect.objectContaining({ siteId: "pagecraft/kettle-co" }),
            expect.any(Function),
            expect.anything(),
        );
    });

    it("remembers the new site, and writes the live URL when it comes up", async () => {
        const fake = fakeSupabase(tables(null));
        const { publishProject } = await import("@/lib/data/publish-project");

        await publishProject(fake.client, USER_ID, PROJECT_ID, KEY);

        const remembered = fake.queries.find(
            (q) => q.table === "projects" && q.op === "update",
        );
        expect(remembered?.payload).toMatchObject({ repo_full_name: "pagecraft/kettle-co" });

        const finished = fake.queries.filter((q) => q.table === "deployments" && q.op === "update");
        expect(finished.at(-1)?.payload).toMatchObject({
            status: "live",
            live_url: "https://kettle-co.pagecrafts.in",
        });
    });

    it("records a failure on the row rather than losing it with the request", async () => {
        deploy.publish.mockRejectedValue(new Error("the host said no"));

        const fake = fakeSupabase(tables());
        const { publishProject } = await import("@/lib/data/publish-project");

        const result = await publishProject(fake.client, USER_ID, PROJECT_ID, KEY);
        expect(result.status).toBe("failed");
        expect(result.error).toMatch(/Publishing did not finish|host said no/i);

        const finished = fake.queries.filter((q) => q.table === "deployments" && q.op === "update");
        expect(finished.at(-1)?.payload).toMatchObject({ status: "failed" });
        expect(String((finished.at(-1)?.payload as { error: string }).error)).toContain(
            "the host said no",
        );
    });
});
