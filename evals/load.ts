import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setGateway } from '@/lib/ai/gateway';
import { MockGateway } from '@/lib/ai/gateway/mock';
import { setProfileStore } from '@/lib/ai/profile-cache';
import { jobStore, setJobStore, nextJobId } from '@/lib/ai/jobs/store';
import { runJob } from '@/lib/ai/jobs/runner';
import type { Job } from '@/lib/ai/jobs/types';
import { buildDashboard, renderDashboard, type GenerationRow } from '@/lib/ai/cost/dashboard';

/**
 * D18 — load harness. Mock-only in CI: overlapping generations, not live
 * providers. A live load test belongs with billing, because free-tier TPM
 * makes concurrent real calls a wall of 429s rather than a measurement.
 *
 *   npm run load
 *   npm run load -- --n=16 --concurrency=8
 */

function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[index] ?? 0;
}

function queued(prompt: string): Job {
    return {
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
    };
}

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
    const pending = new Set<Promise<void>>();
    for (const item of items) {
        const run = fn(item).finally(() => pending.delete(run));
        pending.add(run);
        if (pending.size >= concurrency) await Promise.race(pending);
    }
    await Promise.all([...pending]);
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const get = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
    const n = Number(get('n') ?? 12);
    const concurrency = Number(get('concurrency') ?? 4);

    setGateway(new MockGateway());
    setJobStore(null);
    setProfileStore(null);
    const store = jobStore();

    console.log(`load: ${n} mock generations, concurrency ${concurrency}`);

    const jobs: Job[] = [];
    for (let i = 0; i < n; i += 1) {
        jobs.push(await store.create(queued(`a family dental clinic in koramangala ${i}`)));
    }

    const wall: number[] = [];
    const startedAt = Date.now();
    let done = 0;
    let failed = 0;
    const settled: Job[] = [];

    await pool(jobs, concurrency, async (job) => {
        const t0 = Date.now();
        const result = await runJob(job);
        wall.push(Date.now() - t0);
        settled.push(result);
        if (result.status === 'done' && result.files?.['index.html']) done += 1;
        else failed += 1;
        process.stdout.write(`  · ${result.id} ${result.status}\n`);
    });

    const elapsed = Date.now() - startedAt;
    const dashboardRows: GenerationRow[] = settled.flatMap((job, i) =>
        job.ledger.map((r) => ({
            userId: `u${i % Math.max(1, Math.floor(n / 3))}`,
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

    const dashboard = buildDashboard(dashboardRows);

    const summary = {
        n,
        concurrency,
        done,
        failed,
        elapsedMs: elapsed,
        p50WallMs: Math.round(percentile(wall, 50)),
        p95WallMs: Math.round(percentile(wall, 95)),
        maxWallMs: Math.max(0, ...wall),
        calls: dashboard.total.calls,
        tokens: dashboard.total.tokens,
        nfr003BudgetMs: 45_000,
        withinBudget: Math.max(0, ...wall) < 45_000,
    };

    console.log(`\n${renderDashboard(dashboard)}`);
    console.table(summary);

    const dir = join(process.cwd(), 'evals/grader/results');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `load-${new Date().toISOString().replace(/[:.]/g, '-')}-mock.json`);
    writeFileSync(file, JSON.stringify({ summary, wall }, null, 2));
    console.log(`saved -> ${file}\n`);

    setGateway(null);
    if (failed > 0 || !summary.withinBudget) process.exit(1);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
});
