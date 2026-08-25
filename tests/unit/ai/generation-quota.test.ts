import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/limits/redis', async () => {
    const support = await import('../../support/redis-mock');
    return { redis: () => support.redisStub, isRedisConfigured: () => true };
});

vi.mock('@/lib/data/entitlements', () => ({
    accountPlan: vi.fn(async () => 'starter' as const),
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
    FREE_GENERATIONS_PER_PROJECT,
    PREMIUM_GENERATIONS_PER_PROJECT,
    PRO_GENERATIONS_PER_PROJECT,
} from '@/lib/limits/config';
import { accountPlan } from '@/lib/data/entitlements';

const db = {} as SupabaseClient;

beforeEach(() => {
    resetRedisMock();
    resetFreeGenerationQuota();
    vi.mocked(accountPlan).mockResolvedValue('starter');
});

describe('AI generation quota by account plan', () => {
    it('starts at zero and counts each generation', async () => {
        expect(await freeGenerationsUsed('p_1')).toBe(0);
        expect(await recordFreeGeneration('p_1')).toBe(1);
        expect(await recordFreeGeneration('p_1')).toBe(2);
        expect(await freeGenerationsUsed('p_1')).toBe(2);
        expect(await freeGenerationsUsed('p_2')).toBe(0);
    });

    it(`refuses the ${FREE_GENERATIONS_PER_PROJECT + 1}th Starter generation until they upgrade`, async () => {
        for (let i = 0; i < FREE_GENERATIONS_PER_PROJECT; i++) {
            await recordFreeGeneration('p_1');
        }

        await expect(assertFreeGenerationAllowed('p_1', 'u_1', db)).rejects.toMatchObject({
            code: 'payment_required',
        });
        expect(
            await assertFreeGenerationAllowed('p_1', 'u_1', db).catch((err: ApiError) => err.message),
        ).toMatch(/Starter AI generations/i);
    });

    it('raises the limit to 15 for Pro', async () => {
        vi.mocked(accountPlan).mockResolvedValue('pro');
        for (let i = 0; i < FREE_GENERATIONS_PER_PROJECT; i++) {
            await recordFreeGeneration('p_1');
        }
        await expect(assertFreeGenerationAllowed('p_1', 'u_1', db)).resolves.toMatchObject({
            plan: 'pro',
            limit: PRO_GENERATIONS_PER_PROJECT,
            canGenerate: true,
        });
    });

    it('raises the limit to 45 for Premium', async () => {
        vi.mocked(accountPlan).mockResolvedValue('premium');
        const quota = await readGenerationQuota('p_1', 'u_1', db);
        expect(quota).toMatchObject({
            plan: 'premium',
            limit: PREMIUM_GENERATIONS_PER_PROJECT,
        });
    });

    it('lets a generation pass cover one round past the plan limit', async () => {
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

    it('blocks heavy builds on Starter without a pass', async () => {
        const quota = await readGenerationQuota('p_1', 'u_1', db);
        await expect(assertHeavyBuildAllowed(quota)).rejects.toMatchObject({
            code: 'payment_required',
        });
    });

    it('allows heavy builds on Starter when a pass is available, and spends the pass', async () => {
        await grantGenerationPasses('u_1', 1);
        const quota = await readGenerationQuota('p_1', 'u_1', db);
        await expect(assertHeavyBuildAllowed(quota)).resolves.toBeUndefined();

        await recordGenerationUseForBuild('p_1', 'u_1', quota, true);
        expect(await generationPassesRemaining('u_1')).toBe(0);
        expect(await freeGenerationsUsed('p_1')).toBe(1);
    });

    it('allows heavy builds on Pro without spending a pass', async () => {
        vi.mocked(accountPlan).mockResolvedValue('pro');
        const quota = await readGenerationQuota('p_1', 'u_1', db);
        await expect(assertHeavyBuildAllowed(quota)).resolves.toBeUndefined();
        await recordGenerationUseForBuild('p_1', 'u_1', quota, true);
        expect(await generationPassesRemaining('u_1')).toBe(0);
        expect(await freeGenerationsUsed('p_1')).toBe(1);
    });
});
