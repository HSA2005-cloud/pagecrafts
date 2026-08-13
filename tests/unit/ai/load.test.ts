import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setGateway } from '@/lib/ai/gateway';
import { MockGateway } from '@/lib/ai/gateway/mock';
import { setProfileStore } from '@/lib/ai/profile-cache';
import { jobStore, setJobStore, nextJobId } from '@/lib/ai/jobs/store';
import { runJob } from '@/lib/ai/jobs/runner';
import type { Job } from '@/lib/ai/jobs/types';
import { RateLimiter } from '@/lib/ai/gateway/rate-limit';
import { Budget, generateSpike } from '../../../evals/spike/pipeline';
import { buildDashboard } from '@/lib/ai/cost/dashboard';
import type { GenerationRow } from '@/lib/ai/cost/dashboard';
import type { LedgerRow } from '@/lib/ai/cost/ledger';

/**
 * D18 — load tests. The mock path is the only one that can run in CI without
 * burning quota; what it proves is that the job runner, the limiter and the
 * ledger stay correct when many generations overlap, which is the launch-day
 * shape rather than the one-vertical eval shape.
 */

async function queued(prompt: string): Promise<Job> {
    return jobStore().create({
        id: nextJobId(),
        projectId: 'p_load',
        userId: 'u_load',
        prompt,
        status: 'queued',
        sectionsDone: 0,
        sectionsTotal: 0,
        startedAt: Date.now(),
        events: [],
        ledger: [],
    });
}

function clock() {
    let t = 1_000_000;
    const waits: number[] = [];
    return {
        waits,
        deps: {
            now: () => t,
            sleep: async (ms: number) => { waits.push(ms); t += ms; },
        },
    };
}

beforeEach(() => {
    setGateway(new MockGateway());
    setJobStore(null);
    setProfileStore(null);
});

afterEach(() => {
    setGateway(null);
    setJobStore(null);
    setProfileStore(null);
});

describe('D18 — concurrent generations', () => {
    it('eight overlapping jobs all finish done, with a site each', async () => {
        const jobs = await Promise.all(
            Array.from({ length: 8 }, async (_, i) =>
                runJob(await queued(`a family dental clinic in koramangala ${i}`))),
        );

        expect(jobs.every((j) => j.status === 'done')).toBe(true);
        expect(jobs.every((j) => j.composition)).toBe(true);
        expect(jobs.every((j) => j.files?.['index.html']?.startsWith('<!doctype html>'))).toBe(true);
        expect(new Set(jobs.map((j) => j.id)).size).toBe(8);
    });

    it('the in-memory job store does not lose a concurrent write', async () => {
        const started = await Promise.all(
            Array.from({ length: 6 }, () => queued('a family dental clinic in koramangala')),
        );

        await Promise.all(started.map((job) => runJob(job)));

        const stored = await Promise.all(started.map((j) => jobStore().get(j.id)));
        expect(stored.every((j) => j?.status === 'done')).toBe(true);
        expect(stored.every((j) => (j?.ledger.length ?? 0) > 0)).toBe(true);
    });

    it('the mock spike stays correct under overlapping full runs', async () => {
        const budget = new Budget(1_000);
        const results = await Promise.all(
            Array.from({ length: 6 }, (_, i) => generateSpike({
                vertical: 'dental-clinic',
                prompt: `dental clinic ${i}`,
                hasTemplate: false,
                mode: 'mock',
                budget,
            })),
        );

        expect(results.every((r) => r.ok)).toBe(true);
        expect(results.every((r) => r.files?.['index.html'])).toBe(true);
        expect(results.every((r) => r.modelTimeMs >= 0)).toBe(true);
    });
});

describe('D18 — the limiter under overlapping acquire', () => {
    it('does not let two waiters take the last remaining request', async () => {
        const c = clock();
        const l = new RateLimiter({ rpm: 1, tpm: 1_000_000 }, c.deps);

        const [first, second] = await Promise.all([l.acquire(10), l.acquire(10)]);

        expect(first).toBe(0);
        expect(second).toBe(60_000);
        expect(c.waits).toEqual([60_000]);
    });

    it('does not double-count a reservation that was later recorded', async () => {
        const c = clock();
        const l = new RateLimiter({ rpm: 30, tpm: 2_000 }, c.deps);

        await l.acquire(500);       // reserves ~1,300
        l.record(400, 100);         // replaced by 500
        expect(await l.acquire(500)).toBe(0);
        expect(c.waits).toEqual([]);
    });
});

describe('D18 — the ledger under overlapping jobs', () => {
    it('every concurrent job produces rows the dashboard can total', async () => {
        const jobs = await Promise.all(
            Array.from({ length: 5 }, async () =>
                runJob(await queued('a family dental clinic in koramangala'))),
        );

        const rows: GenerationRow[] = jobs.flatMap((job, i) =>
            job.ledger.map((r: LedgerRow) => ({
                userId: `u${i}`,
                provider: r.provider,
                model: r.model,
                stage: r.stage,
                promptVersion: r.promptVersion,
                inputTokens: r.inputTokens,
                outputTokens: r.outputTokens,
                costCents: r.costCents,
                status: r.status,
                latencyMs: r.latencyMs,
                createdAt: r.createdAt,
            })));

        const d = buildDashboard(rows);
        expect(d.total.calls).toBe(rows.length);
        expect(d.users).toBe(5);
        expect(d.generations).toBe(5);
        expect(d.failureRate).toBe(0);
    });
});
