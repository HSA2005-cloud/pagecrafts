import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/limits/redis', async () => {
    const support = await import('../../support/redis-mock');
    return { redis: () => support.redisStub, isRedisConfigured: () => true };
});

vi.mock('@/lib/data/entitlements', () => ({
    hasAdvanced: vi.fn(async () => false),
}));

import { resetRedisMock } from '../../support/redis-mock';
import { ApiError } from '@/lib/errors/respond';
import {
    assertFreeGenerationAllowed,
    assertHeavyBuildAllowed,
    freeGenerationsUsed,
    generationPassesRemaining,
    grantGenerationPasses,
    recordFreeGeneration,
    recordGenerationUseForBuild,
    resetFreeGenerationQuota,
    readGenerationQuota,
} from '@/lib/ai/jobs/quota';
import {
    ADVANCED_GENERATIONS_PER_PROJECT,
    FREE_GENERATIONS_PER_PROJECT,
} from '@/lib/limits/config';
import { hasAdvanced } from '@/lib/data/entitlements';

const db = {} as SupabaseClient;

beforeEach(() => {
    resetRedisMock();
    resetFreeGenerationQuota();
    vi.mocked(hasAdvanced).mockResolvedValue(false);
});

describe('AI generation quota packages', () => {
    it('starts at zero and counts each generation', async () => {
        expect(await freeGenerationsUsed('p_1')).toBe(0);
        expect(await recordFreeGeneration('p_1')).toBe(1);
        expect(await recordFreeGeneration('p_1')).toBe(2);
        expect(await freeGenerationsUsed('p_1')).toBe(2);
        expect(await freeGenerationsUsed('p_2')).toBe(0);
    });

    it(`refuses the ${FREE_GENERATIONS_PER_PROJECT + 1}th Free generation until they pay`, async () => {
        for (let i = 0; i < FREE_GENERATIONS_PER_PROJECT; i++) {
            await recordFreeGeneration('p_1');
        }

        await expect(assertFreeGenerationAllowed('p_1', 'u_1', db)).rejects.toMatchObject({
            code: 'payment_required',
        });
        expect(
            await assertFreeGenerationAllowed('p_1', 'u_1', db).catch((err: ApiError) => err.message),
        ).toMatch(/Free AI generations/i);
    });

    it('raises the limit to 30 for Advanced', async () => {
        vi.mocked(hasAdvanced).mockResolvedValue(true);
        for (let i = 0; i < FREE_GENERATIONS_PER_PROJECT; i++) {
            await recordFreeGeneration('p_1');
        }
        await expect(assertFreeGenerationAllowed('p_1', 'u_1', db)).resolves.toMatchObject({
            package: 'advanced',
            limit: ADVANCED_GENERATIONS_PER_PROJECT,
            canGenerate: true,
        });
    });

    it('lets a generation pass cover one round past the package limit', async () => {
        for (let i = 0; i < FREE_GENERATIONS_PER_PROJECT; i++) {
            await recordFreeGeneration('p_1');
        }
        await grantGenerationPasses('u_1', 1);
        expect(await generationPassesRemaining('u_1')).toBe(1);

        await expect(assertFreeGenerationAllowed('p_1', 'u_1', db)).resolves.toMatchObject({
            canGenerate: true,
            passes: 1,
        });

        await recordFreeGeneration('p_1', 'u_1', FREE_GENERATIONS_PER_PROJECT);
        expect(await generationPassesRemaining('u_1')).toBe(0);
        await expect(assertFreeGenerationAllowed('p_1', 'u_1', db)).rejects.toMatchObject({
            code: 'payment_required',
        });
    });

    it('blocks heavy builds on Free without a pass', async () => {
        const quota = await readGenerationQuota('p_1', 'u_1', db);
        await expect(assertHeavyBuildAllowed(quota)).rejects.toMatchObject({
            code: 'payment_required',
        });
    });

    it('allows heavy builds on Free when a pass is available, and spends the pass', async () => {
        await grantGenerationPasses('u_1', 1);
        const quota = await readGenerationQuota('p_1', 'u_1', db);
        await expect(assertHeavyBuildAllowed(quota)).resolves.toBeUndefined();

        await recordGenerationUseForBuild('p_1', 'u_1', quota, true);
        expect(await generationPassesRemaining('u_1')).toBe(0);
        expect(await freeGenerationsUsed('p_1')).toBe(1);
    });

    it('allows heavy builds on Advanced without spending a pass', async () => {
        vi.mocked(hasAdvanced).mockResolvedValue(true);
        const quota = await readGenerationQuota('p_1', 'u_1', db);
        await expect(assertHeavyBuildAllowed(quota)).resolves.toBeUndefined();
        await recordGenerationUseForBuild('p_1', 'u_1', quota, true);
        expect(await generationPassesRemaining('u_1')).toBe(0);
        expect(await freeGenerationsUsed('p_1')).toBe(1);
    });
});
