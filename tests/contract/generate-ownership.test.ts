import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "../support/fake-db";

// POST /projects/{id}/generate must not answer for a project the caller cannot see.
//
// Found by the D14 cross-user audit, which left e2e/cross-user.spec.ts red on purpose:
// every other write route on a project reads it through RLS first and answers not_found for
// somebody else's, and this one did not. `params.id` went straight into the budget check,
// the free-generation quota, the job and the persist step.
//
// RLS still refused the final write, so no project was overwritten — but the caller got a
// 202 saying their generation had started, a job ran, and their budget and quota were spent
// on a project belonging to someone else. "Nothing was corrupted" is not the same as "the
// request should have been answered".
//
// The e2e spec covers this against a real database. This covers it here too, because e2e
// needs Docker and Supabase and this needs neither, so it runs on every push.

const auth = vi.hoisted(() => ({ requireUser: vi.fn(), supabaseRoute: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
    requireUser: auth.requireUser,
    supabaseRoute: auth.supabaseRoute,
}));

// The generation machinery is not what is being tested, and every one of these would
// otherwise reach for Redis, a model or a job store. If the ownership check works, none of
// them should be called at all for a stranger — which is itself asserted below.
const ai = vi.hoisted(() => ({
    checkGenerationBudget: vi.fn(),
    assertFreeGenerationAllowed: vi.fn(),
    assertHeavyBuildAllowed: vi.fn(),
    recordGenerationUseForBuild: vi.fn(),
    guardAiRequest: vi.fn(),
    create: vi.fn(),
}));

vi.mock("@/lib/ai/jobs/budget", () => ({ checkGenerationBudget: ai.checkGenerationBudget }));
vi.mock("@/lib/ai/jobs/quota", () => ({
    assertFreeGenerationAllowed: ai.assertFreeGenerationAllowed,
    assertHeavyBuildAllowed: ai.assertHeavyBuildAllowed,
    recordGenerationUseForBuild: ai.recordGenerationUseForBuild,
    recordFreeGeneration: vi.fn(),
}));
vi.mock("@/lib/limits/ai-guard", () => ({ guardAiRequest: ai.guardAiRequest }));
vi.mock("@/lib/ai/jobs/store", () => ({
    jobStore: () => ({ create: ai.create }),
    nextJobId: () => "job_1",
}));
vi.mock("@/lib/ai/jobs/runner", () => ({ runJob: vi.fn(async () => undefined) }));
vi.mock("@/lib/ai/jobs/counters", () => ({ recordGenerationUse: vi.fn() }));

const OWNER = "11111111-1111-4111-8111-000000000001";
const STRANGER = "11111111-1111-4111-8111-000000000002";

let db: FakeDb;
let projectId: string;

function signedInAs(userId: string) {
    const supabase = db.asUser(userId);
    auth.requireUser.mockResolvedValue({ userId, supabase });
    auth.supabaseRoute.mockResolvedValue(supabase);
}

const post = async (id: string) => {
    const { POST } = await import("@/app/api/v1/projects/[id]/generate/route");
    const response = await POST(
        new Request(`http://localhost/api/v1/projects/${id}/generate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ prompt: "a site for my cafe" }),
        }) as never,
        { params: Promise.resolve({ id }) } as never,
    );
    return { status: response.status, body: await response.json() };
};

beforeEach(() => {
    vi.clearAllMocks();

    db = createFakeDb({ users: [{ id: OWNER }, { id: STRANGER }] });
    projectId = db.insert("projects", {
        user_id: OWNER,
        name: "Kettle & Co.",
        content_json: {},
        site_meta: {},
    }).id as string;

    ai.checkGenerationBudget.mockResolvedValue({ ok: true });
    ai.assertFreeGenerationAllowed.mockResolvedValue({
        used: 0,
        limit: 3,
        remaining: 3,
        unlimited: false,
        package: 'free',
        passes: 0,
        canGenerate: true,
    });
    ai.assertHeavyBuildAllowed.mockResolvedValue(undefined);
    ai.recordGenerationUseForBuild.mockResolvedValue(1);
    ai.guardAiRequest.mockResolvedValue({
        ok: true,
        recordUsage: vi.fn(),
        release: vi.fn(async () => undefined),
    });
    ai.create.mockImplementation(async (job: unknown) => job);
});

describe("POST /projects/{id}/generate", () => {
    it("refuses a project the caller cannot see, with the same answer as every other route", async () => {
        signedInAs(STRANGER);

        const { status, body } = await post(projectId);

        expect(status).toBe(404);
        expect(body).toMatchObject({ ok: false, error: { code: "not_found" } });
    });

    it("spends none of the stranger's budget, quota or concurrency on it", async () => {
        // The order matters as much as the refusal: checking ownership after the budget
        // call would still answer 404 while having charged them for the attempt.
        signedInAs(STRANGER);

        await post(projectId);

        expect(ai.checkGenerationBudget).not.toHaveBeenCalled();
        expect(ai.assertFreeGenerationAllowed).not.toHaveBeenCalled();
        expect(ai.guardAiRequest).not.toHaveBeenCalled();
    });

    it("starts no job for it", async () => {
        signedInAs(STRANGER);

        await post(projectId);

        expect(ai.create).not.toHaveBeenCalled();
    });

    it("answers not_found for an id that belongs to nobody", async () => {
        signedInAs(OWNER);

        const { status, body } = await post("99999999-9999-4999-8999-999999999999");

        expect(status).toBe(404);
        expect(body.error.code).toBe("not_found");
    });

    it("still starts generation for the owner", async () => {
        signedInAs(OWNER);

        const { status, body } = await post(projectId);

        expect(status).toBe(202);
        expect(body).toMatchObject({ ok: true, data: { job_id: "job_1" } });
        expect(ai.create).toHaveBeenCalled();
    });
});
