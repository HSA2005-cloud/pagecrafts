import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
    requireUser: auth.requireUser,
    supabaseRoute: async () => ({}),
}));

vi.mock('@/lib/limits/redis', async () => {
    const support = await import('../support/redis-mock');
    return { redis: () => support.redisStub, isRedisConfigured: () => true };
});

import { redisMock as limits, resetRedisMock } from '../support/redis-mock';
import { setGateway } from '@/lib/ai/gateway';
import { MockGateway } from '@/lib/ai/gateway/mock';
import { setGenerationCounters } from '@/lib/ai/jobs/budget';
import { jobStore, setJobStore } from '@/lib/ai/jobs/store';
import { POST } from '@/app/api/v1/projects/[id]/generate/route';
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

beforeEach(() => {
    auth.requireUser.mockResolvedValue({ userId: 'u_1', supabase: {} });
    resetRedisMock();
    limits.evalMock.mockImplementation(async (_s: string, keys: string[]) =>
        keys[0]?.startsWith('cc:') ? 1 : [1, 19, 0]);
    setJobStore(null);
    setGenerationCounters(null);
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
    });

    it('falls back rather than failing when generation is abandoned', async () => {
        setGateway(new MockGateway('error'));
        const res = await generate({ prompt: 'anything at all' });
        const { data } = await res.json();
        const job = await settled(data.job_id);

        expect(job.status).toBe('failed');
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
    });

    it('R7: another user\'s job is not_found, not forbidden', async () => {
        const res = await generate({ prompt: 'a family dental clinic in koramangala' });
        const { data } = await res.json();

        auth.requireUser.mockResolvedValue({ userId: 'u_2', supabase: {} });
        const poll = await pollJob(data.job_id);

        expect(poll.status).toBe(404);
        expect((await poll.json()).error.code).toBe('not_found');
    });

    it('an unknown job id is not_found', async () => {
        const poll = await pollJob('job_nope');
        expect(poll.status).toBe(404);
    });
});
