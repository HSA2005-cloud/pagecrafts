import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createFakeDb } from '../support/fake-db';

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
const ledger = vi.hoisted(() => ({ persist: vi.fn() }));
const entitlements = vi.hoisted(() => ({
    hasPro: vi.fn(async () => false),
    hasPremium: vi.fn(async () => false),
    hasAdvanced: vi.fn(async () => false),
    accountPlan: vi.fn(async (_db?: unknown, _userId?: string): Promise<'starter' | 'pro' | 'premium'> => 'starter'),
    hasStyleAccess: vi.fn(async (_db: unknown, _userId: string, styleId: string) => styleId === 'casual'),
}));
vi.mock('@/lib/auth/session', () => ({
    requireUser: auth.requireUser,
    supabaseRoute: async () => ({}),
}));
vi.mock('@/lib/ai/cost/persist', () => ({
    persistLedger: ledger.persist,
}));
vi.mock('@/lib/data/entitlements', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/data/entitlements')>();
    return {
        ...actual,
        hasPro: entitlements.hasPro,
        hasPremium: entitlements.hasPremium,
        hasAdvanced: entitlements.hasAdvanced,
        accountPlan: entitlements.accountPlan,
        hasStyleAccess: entitlements.hasStyleAccess,
    };
});

vi.mock('@/lib/limits/redis', async () => {
    const support = await import('../support/redis-mock');
    return { redis: () => support.redisStub, isRedisConfigured: () => true };
});

const quota = vi.hoisted(() => ({
    assertFreeGenerationAllowed: vi.fn(),
}));
vi.mock('@/lib/ai/jobs/quota', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/ai/jobs/quota')>();
    return {
        ...actual,
        assertFreeGenerationAllowed: quota.assertFreeGenerationAllowed,
    };
});

import { redisMock as limits, resetRedisMock } from '../support/redis-mock';
import { setGateway } from '@/lib/ai/gateway';
import { MockGateway } from '@/lib/ai/gateway/mock';
import { setGenerationCounters } from '@/lib/ai/jobs/budget';
import { resetDiversityStore } from '@/lib/ai/composition/diversity';
import { jobStore, setJobStore } from '@/lib/ai/jobs/store';
import {
    recordFreeGeneration,
    resetFreeGenerationQuota,
} from '@/lib/ai/jobs/quota';
import { FREE_GENERATIONS_PER_PROJECT, PREMIUM_GENERATIONS_PER_PROJECT, PRO_GENERATIONS_PER_PROJECT } from '@/lib/limits/config';
import { POST } from '@/app/api/v1/projects/[id]/generate/route';
import { POST as choose } from '@/app/api/v1/projects/[id]/generate/choose/route';
import { GET } from '@/app/api/v1/jobs/[id]/route';

const generate = (body: unknown, projectId = 'p_1') =>
    POST(
        new Request('http://x/api/v1/projects/p_1/generate', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
        }) as never,
        { params: Promise.resolve({ id: projectId }) } as never,
    );

const pollJob = (id: string) =>
    GET(
        new Request(`http://x/api/v1/jobs/${id}`) as never,
        { params: Promise.resolve({ id }) } as never,
    );

/** Wait for the detached runner to reach a terminal state. */
async function settled(id: string) {
    for (let i = 0; i < 200; i++) {
        const job = await jobStore().get(id);
        if (job && (job.status === 'done' || job.status === 'failed')) return job;
        await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('job did not settle');
}

// The generate route reads the project through RLS before it starts anything, so a session
// in these tests needs a client that can see one. Backed by the same fake database the
// persistence tests use rather than a bespoke stub: these specs also exercise /edits and
// the look-picker, and those reach for query shapes a hand-rolled builder does not have.
//
// What each test is about is generation, not ownership — /generate refusing somebody else's
// project is covered on its own in generate-ownership.test.ts.
function sessionFor(userId: string) {
    const db = createFakeDb({ users: [{ id: userId }] });
    db.insert('projects', { id: 'p_1', user_id: userId, name: 'Test site', content_json: {}, site_meta: {} });
    return { userId, supabase: db.asUser(userId) };
}

beforeEach(() => {
    auth.requireUser.mockResolvedValue(sessionFor('u_1'));
    ledger.persist.mockReset().mockResolvedValue(undefined);
    resetRedisMock();
    limits.evalMock.mockImplementation(async (_s: string, keys: string[]) =>
        keys[0]?.startsWith('cc:') ? 1 : [1, 19, 0]);
    setJobStore(null);
    setGenerationCounters(null);
    resetDiversityStore();
    resetFreeGenerationQuota();
    entitlements.hasPro.mockResolvedValue(false);
    entitlements.hasPremium.mockResolvedValue(false);
    entitlements.hasAdvanced.mockResolvedValue(false);
    entitlements.accountPlan.mockResolvedValue('starter');
    quota.assertFreeGenerationAllowed.mockImplementation(async (projectId, userId, supabase) => {
        const plan = await entitlements.accountPlan(supabase, userId);
        const { freeGenerationsUsed } =
            await vi.importActual<typeof import('@/lib/ai/jobs/quota')>('@/lib/ai/jobs/quota');
        const used = await freeGenerationsUsed(projectId);
        const limit =
            plan === 'premium'
                ? PREMIUM_GENERATIONS_PER_PROJECT
                : plan === 'pro'
                  ? PRO_GENERATIONS_PER_PROJECT
                  : FREE_GENERATIONS_PER_PROJECT;
        const remaining = Math.max(0, limit - used);
        const canGenerate = remaining > 0;
        const row = {
            used,
            limit,
            remaining,
            unlimited: false,
            plan,
            passes: 0,
            canGenerate,
        };
        if (!canGenerate) {
            const { ApiError } = await import('@/lib/errors/respond');
            const { ACCOUNT_PLAN_LABEL } = await import('@/lib/contracts');
            throw new ApiError(
                'payment_required',
                `You have used your ${limit} ${ACCOUNT_PLAN_LABEL[plan]} AI generations on this site.`,
            );
        }
        return row;
    });
    entitlements.hasStyleAccess.mockImplementation(
        async (_db: unknown, _userId: string, styleId: string) => styleId === 'casual',
    );
    setGateway(new MockGateway());
});

afterEach(() => {
    setGateway(null);
    setGenerationCounters(null);
    vi.clearAllMocks();
});

describe('POST /api/v1/projects/{id}/generate', () => {
    it('R1: returns 202 with a job id', async () => {
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const json = await res.json();

        expect(res.status).toBe(202);
        expect(json.ok).toBe(true);
        expect(json.data.job_id).toMatch(/^job_/);
    });

    it('R2: over the daily cap returns DAILY_CAP_REACHED, not a 500', async () => {
        setGenerationCounters({
            async userDailyUsed() { return 20; },
            userDailyLimit() { return 20; },
            async projectBudgetExhausted() { return false; },
        });

        const res = await generate({ prompt: 'anything' });
        const json = await res.json();

        expect(res.status).toBe(429);
        expect(json.error.message).toBe('DAILY_CAP_REACHED');
    });

    it('R3: a spent shared budget returns PROJECT_QUOTA_EXHAUSTED', async () => {
        setGenerationCounters({
            async userDailyUsed() { return 0; },
            userDailyLimit() { return 20; },
            async projectBudgetExhausted() { return true; },
        });

        const res = await generate({ prompt: 'anything' });
        const json = await res.json();

        expect(json.error.message).toBe('PROJECT_QUOTA_EXHAUSTED');
        expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects an empty prompt before creating a job', async () => {
        const res = await generate({ prompt: '' });
        expect(res.status).toBe(422);
    });

    it('rejects unauthenticated requests', async () => {
        const { ApiError } = await import('@/lib/errors/respond');
        auth.requireUser.mockRejectedValue(new ApiError('unauthorized', 'Please sign in.'));
        const res = await generate({ prompt: 'hi' });
        expect(res.status).toBe(401);
    });
});

describe('the job runner', () => {
    it('R4: walks the agreed states and finishes done', async () => {
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();

        const job = await settled(data.job_id);
        expect(job.status).toBe('done');
        expect(job.composition).toBeDefined();
        expect(job.files?.['index.html']).toMatch(/^<!doctype html>/i);
        expect(job.sectionsDone).toBe(job.sectionsTotal);
        expect(job.sectionsTotal).toBeGreaterThan(0);
    });

    it('emits plan, section and done in order', async () => {
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();
        const job = await settled(data.job_id);

        const names = job.events.map((e) => e.name);
        expect(names[0]).toBe('plan');
        expect(names).toContain('section');
        expect(names).toContain('validate');
        expect(names.at(-1)).toBe('done');
        expect(names.indexOf('validate')).toBeGreaterThan(names.lastIndexOf('section'));
        const plan = job.events.find((e) => e.name === 'plan');
        expect(plan?.data?.types).toEqual(expect.arrayContaining(['hero']));
    });

    it('R5: enters repairing at most once per section', async () => {
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();
        const job = await settled(data.job_id);

        const repairs = job.events.filter((e) => e.name === 'repair');
        const perSection = new Map<string, number>();
        for (const r of repairs) {
            const key = String(r.data?.section);
            perSection.set(key, (perSection.get(key) ?? 0) + 1);
        }
        for (const count of perSection.values()) expect(count).toBeLessThanOrEqual(1);
    });

    it('writes one ledger row per model call, each naming its provider', async () => {
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();
        const job = await settled(data.job_id);

        expect(job.ledger.length).toBeGreaterThanOrEqual(job.sectionsTotal + 3);
        expect(job.ledger.every((r) => !!r.provider)).toBe(true);
        expect(ledger.persist).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                jobId: job.id,
                userId: 'u_1',
                projectId: 'p_1',
            }),
            job.ledger,
        );
        expect(limits.hincrbyMock).toHaveBeenCalled();
        expect(limits.zremMock).toHaveBeenCalled();
    });

    it('falls back rather than failing when generation is abandoned', async () => {
        setGateway(new MockGateway('error'));
        const res = await generate({ prompt: 'anything at all' });
        const { data } = await res.json();
        const job = await settled(data.job_id);

        expect(job.status).toBe('done');
        expect(job.fallbackTemplateId).toBeTruthy();
        expect(job.events.map((e) => e.name)).toContain('fallback');
    });
});

describe('GET /api/v1/jobs/{id}', () => {
    it('R6: reports progress and names the provider', async () => {
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();
        await settled(data.job_id);

        const poll = await pollJob(data.job_id);
        const json = await poll.json();

        expect(poll.status).toBe(200);
        expect(json.data).toMatchObject({
            status: 'done',
            sections_done: expect.any(Number),
            sections_total: expect.any(Number),
            provider: expect.any(String),
            elapsed_ms: expect.any(Number),
            files_ready: true,
        });
        expect(json.data.variants).toHaveLength(3);
        expect(json.data.variants.map((v: { id: string }) => v.id)).toEqual([
            'casual', 'photos', 'motion',
        ]);
        expect(json.data.variants.every((v: { html: string }) => v.html.startsWith('<!doctype html>'))).toBe(true);
        expect(json.data.preview_html).toMatch(/^<!doctype html>/i);
        expect(json.data.planned_sections).toEqual(expect.arrayContaining(['hero']));
        expect(json.data.attempts).toHaveLength(1);
        expect(json.data.quota).toMatchObject({
            used: 1,
            limit: FREE_GENERATIONS_PER_PROJECT,
            remaining: FREE_GENERATIONS_PER_PROJECT - 1,
            unlimited: false,
        });
        expect(json.data.prompt).toBe('a family dental clinic in koramangala');
    });

    it('R7: another user\'s job is not_found, not forbidden', async () => {
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();

        auth.requireUser.mockResolvedValue(sessionFor('u_2'));
        const poll = await pollJob(data.job_id);

        expect(poll.status).toBe(404);
        expect((await poll.json()).error.code).toBe('not_found');
    });

    it('an unknown job id is not_found', async () => {
        const poll = await pollJob('job_nope');
        expect(poll.status).toBe(404);
    });
});

describe('POST /api/v1/projects/{id}/generate/choose', () => {
    it('records the photo-rich look on the job', async () => {
        entitlements.hasStyleAccess.mockImplementation(
            async (_db: unknown, _userId: string, styleId: string) =>
                styleId === 'casual' || styleId === 'photos',
        );
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();
        await settled(data.job_id);

        const picked = await choose(
            new Request('http://x/api/v1/projects/p_1/generate/choose', {
                method: 'POST',
                body: JSON.stringify({ jobId: data.job_id, variantId: 'photos' }),
                headers: { 'content-type': 'application/json' },
            }) as never,
            { params: Promise.resolve({ id: 'p_1' }) } as never,
        );
        const json = await picked.json();

        expect(picked.status).toBe(200);
        expect(json.data.variant_id).toBe('photos');
        const job = await jobStore().get(data.job_id);
        // The theme is drawn per business now rather than fixed per tier, so the assertion
        // is that the chosen look was recorded at all — not which one it happened to be.
        expect(job?.composition?.artDirection.themeId).toBeTruthy();
        expect(job?.files?.['index.html']).toContain('data-style="photos"');
    });

    it('refuses a Pro look until the account has paid', async () => {
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();
        await settled(data.job_id);

        const picked = await choose(
            new Request('http://x/api/v1/projects/p_1/generate/choose', {
                method: 'POST',
                body: JSON.stringify({ jobId: data.job_id, variantId: 'photos' }),
                headers: { 'content-type': 'application/json' },
            }) as never,
            { params: Promise.resolve({ id: 'p_1' }) } as never,
        );
        const json = await picked.json();

        expect(picked.status).toBe(402);
        expect(json.error.code).toBe('payment_required');
    });

    it('refuses a Premium look until the account has Premium', async () => {
        entitlements.hasPro.mockResolvedValue(true);
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();
        await settled(data.job_id);

        const picked = await choose(
            new Request('http://x/api/v1/projects/p_1/generate/choose', {
                method: 'POST',
                body: JSON.stringify({ jobId: data.job_id, variantId: 'motion' }),
                headers: { 'content-type': 'application/json' },
            }) as never,
            { params: Promise.resolve({ id: 'p_1' }) } as never,
        );
        const json = await picked.json();

        expect(picked.status).toBe(402);
        expect(json.error.code).toBe('payment_required');
    });

    it('lets them pick the free look without paying', async () => {
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();
        await settled(data.job_id);

        const picked = await choose(
            new Request('http://x/api/v1/projects/p_1/generate/choose', {
                method: 'POST',
                body: JSON.stringify({ jobId: data.job_id, variantId: 'casual' }),
                headers: { 'content-type': 'application/json' },
            }) as never,
            { params: Promise.resolve({ id: 'p_1' }) } as never,
        );

        expect(picked.status).toBe(200);
        expect((await picked.json()).data.variant_id).toBe('casual');
    });

    it('refuses a look that was not generated', async () => {
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();
        await settled(data.job_id);

        const picked = await choose(
            new Request('http://x/api/v1/projects/p_1/generate/choose', {
                method: 'POST',
                body: JSON.stringify({ jobId: data.job_id, variantId: 'neon' }),
                headers: { 'content-type': 'application/json' },
            }) as never,
            { params: Promise.resolve({ id: 'p_1' }) } as never,
        );
        expect(picked.status).toBe(422);
    });

    it('lets them pick a look from an earlier generation', async () => {
        const first = await generate({ prompt: 'a family dental clinic in koramangala' });
        const firstJson = await first.json();
        await settled(firstJson.data.job_id);

        const second = await generate({ prompt: 'a family dental clinic in koramangala' });
        const secondJson = await second.json();
        await settled(secondJson.data.job_id);

        const poll = await pollJob(secondJson.data.job_id);
        const pollJson = await poll.json();
        expect(pollJson.data.attempts).toHaveLength(2);
        expect(pollJson.data.attempts.map((a: { job_id: string }) => a.job_id)).toEqual([
            firstJson.data.job_id,
            secondJson.data.job_id,
        ]);

        const picked = await choose(
            new Request('http://x/api/v1/projects/p_1/generate/choose', {
                method: 'POST',
                body: JSON.stringify({ jobId: firstJson.data.job_id, variantId: 'casual' }),
                headers: { 'content-type': 'application/json' },
            }) as never,
            { params: Promise.resolve({ id: 'p_1' }) } as never,
        );
        expect(picked.status).toBe(200);
        expect((await picked.json()).data.variant_id).toBe('casual');
    });
});

describe('free generation quota', () => {
    it(`the ${FREE_GENERATIONS_PER_PROJECT + 1}th generation on a project is payment_required`, async () => {
        for (let i = 0; i < FREE_GENERATIONS_PER_PROJECT; i++) {
            await recordFreeGeneration('p_1');
        }

        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const json = await res.json();

        expect(res.status).toBe(402);
        expect(json.error.code).toBe('payment_required');
        expect(json.error.message).toMatch(/Starter AI generations/i);
    });

    it('a Pro account can generate past the Starter cap', async () => {
        entitlements.accountPlan.mockResolvedValue('pro');
        for (let i = 0; i < FREE_GENERATIONS_PER_PROJECT; i++) {
            await recordFreeGeneration('p_1');
        }

        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        expect(res.status).toBe(202);
    });
});
