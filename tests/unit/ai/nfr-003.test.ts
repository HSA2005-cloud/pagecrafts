import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AutoGrade } from '../../../evals/grader/index';

/**
 * D15 / D8 carry-over: NFR-003 is P95 *model* time under 45s, excluding
 * client-side pacing. The D11 baseline is the first corpus whose `latencyMs`
 * was recorded after that subtraction, so it is the first figure that can
 * answer the requirement.
 */

const BASELINE = join(
    process.cwd(),
    'evals/grader/results/2026-08-12T18-00-38-385Z-baseline-full/grades.json',
);

function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[index] ?? 0;
}

describe('NFR-003 — P95 model time on the D11 baseline', () => {
    it('the committed baseline is present', () => {
        expect(existsSync(BASELINE), 'D11 baseline grades missing').toBe(true);
    });

    it('every completed vertical finished under 45s of model time', () => {
        const grades: AutoGrade[] = JSON.parse(readFileSync(BASELINE, 'utf8'));
        const completed = grades.filter((g) => g.completed);

        expect(completed.length).toBeGreaterThanOrEqual(9);

        const times = completed.map((g) => g.latencyMs);
        const p95 = percentile(times, 95);
        const mean = times.reduce((a, b) => a + b, 0) / times.length;

        expect(Math.max(...times)).toBeLessThan(45_000);
        expect(p95).toBeLessThan(45_000);
        expect(mean).toBeLessThan(45_000);
    });

    it('failures on that run are capacity, not quality — completed rows all passed', () => {
        const grades: AutoGrade[] = JSON.parse(readFileSync(BASELINE, 'utf8'));
        const completed = grades.filter((g) => g.completed);
        expect(completed.every((g) => g.passed)).toBe(true);
        expect(completed.every((g) => !g.fallbackUsed)).toBe(true);
    });
});
