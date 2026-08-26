import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '@/lib/errors/respond';
import { accountPlan } from '@/lib/data/entitlements';
import { redis, isRedisConfigured } from '@/lib/limits/redis';
import { FREE_GENERATIONS_PER_PROJECT } from '@/lib/limits/config';
import type { AccountPlan } from '@/lib/contracts';
import { ACCOUNT_PLAN_LABEL } from '@/lib/contracts';
import { generationsLimitForPlan } from '@/lib/payments/plans';

export type GenerationQuota = {
    used: number;
    limit: number;
    /** Generations left in the plan allowance (not counting paid passes). */
    remaining: number;
    /** Kept for older clients — always false; paid plans raise the limit, they do not remove it. */
    unlimited: boolean;
    plan: AccountPlan;
    /** One-round passes left (legacy). Prefer upgrading the account plan. */
    passes: number;
    /** Whether they can start another generation right now. */
    canGenerate: boolean;
};

function asCount(value: unknown): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function usedKey(projectId: string): string {
    return `gen:free:project:${projectId}`;
}

function passKey(userId: string): string {
    return `gen:pass:user:${userId}`;
}

/** Process-local counts so tests (and Redis-down) still enforce the cap. */
const localUsed = new Map<string, number>();
const localPasses = new Map<string, number>();

export function resetFreeGenerationQuota(): void {
    localUsed.clear();
    localPasses.clear();
}

export async function freeGenerationsUsed(projectId: string): Promise<number> {
    let remote = 0;
    if (isRedisConfigured()) {
        try {
            remote = asCount(await redis().get(usedKey(projectId)));
        } catch {
            remote = 0;
        }
    }
    return Math.max(localUsed.get(projectId) ?? 0, remote);
}

export async function generationPassesRemaining(userId: string): Promise<number> {
    let remote = 0;
    if (isRedisConfigured()) {
        try {
            remote = asCount(await redis().get(passKey(userId)));
        } catch {
            remote = 0;
        }
    }
    return Math.max(localPasses.get(userId) ?? 0, remote);
}

export async function grantGenerationPasses(userId: string, count = 1): Promise<number> {
    const next = (await generationPassesRemaining(userId)) + Math.max(1, count);
    localPasses.set(userId, next);
    if (isRedisConfigured()) {
        try {
            await redis().set(passKey(userId), next);
        } catch (err) {
            console.warn('[quota] could not persist generation passes', err);
        }
    }
    return next;
}

async function consumeGenerationPass(userId: string): Promise<boolean> {
    const current = await generationPassesRemaining(userId);
    if (current <= 0) return false;
    const next = current - 1;
    localPasses.set(userId, next);
    if (isRedisConfigured()) {
        try {
            await redis().set(passKey(userId), next);
        } catch (err) {
            console.warn('[quota] could not consume generation pass', err);
        }
    }
    return true;
}

async function bumpGenerationUsed(projectId: string): Promise<number> {
    const next = (await freeGenerationsUsed(projectId)) + 1;
    localUsed.set(projectId, next);
    if (isRedisConfigured()) {
        try {
            await redis().set(usedKey(projectId), next);
        } catch (err) {
            console.warn('[quota] could not persist free generation count', err);
        }
    }
    return next;
}

export async function recordFreeGeneration(
    projectId: string,
    userId?: string,
    limit?: number,
): Promise<number> {
    const used = await freeGenerationsUsed(projectId);
    const ceiling = limit ?? FREE_GENERATIONS_PER_PROJECT;
    if (userId && used >= ceiling) {
        const spent = await consumeGenerationPass(userId);
        if (!spent) {
            throw new ApiError(
                'payment_required',
                'You have used every AI generation on this site for your plan. Upgrade on User Plans for more.',
            );
        }
    }

    return bumpGenerationUsed(projectId);
}

/**
 * Record a generation. Heavy builds on Starter always spend a pass when over the cap;
 * Pro and Premium plans include enough allowance for custom builds.
 */
export async function recordGenerationUseForBuild(
    projectId: string,
    userId: string,
    quota: GenerationQuota,
    heavy: boolean,
): Promise<number> {
    if (heavy && quota.plan === 'starter') {
        const spent = await consumeGenerationPass(userId);
        if (!spent) {
            throw new ApiError(
                'payment_required',
                'This description needs a custom AI build. Upgrade to Pro or Premium on User Plans.',
            );
        }
        return bumpGenerationUsed(projectId);
    }
    return recordFreeGeneration(projectId, userId, quota.limit);
}

export async function readGenerationQuota(
    projectId: string,
    userId: string,
    supabase: SupabaseClient,
): Promise<GenerationQuota> {
    const plan = await accountPlan(supabase, userId);
    const limit = generationsLimitForPlan(plan);
    const used = await freeGenerationsUsed(projectId);
    const passes = await generationPassesRemaining(userId);
    const remaining = Math.max(0, limit - used);
    return {
        used,
        limit,
        remaining,
        unlimited: false,
        plan,
        passes,
        canGenerate: remaining > 0 || passes > 0,
    };
}

export async function assertFreeGenerationAllowed(
    projectId: string,
    userId: string,
    supabase: SupabaseClient,
): Promise<GenerationQuota> {
    const quota = await readGenerationQuota(projectId, userId, supabase);
    if (quota.canGenerate) return quota;

    const label = ACCOUNT_PLAN_LABEL[quota.plan];
    const upgrade =
        quota.plan === 'starter'
            ? 'Upgrade to Pro (5× AI) or Premium (15× AI) on User Plans.'
            : quota.plan === 'pro'
              ? 'Upgrade to Premium (15× AI) on User Plans.'
              : '';

    throw new ApiError(
        'payment_required',
        `You have used your ${quota.limit} ${label} AI generations on this site. ${upgrade}`.trim(),
    );
}

/**
 * Heavy / custom builds (carts, apps, multi-file JS) cost more tokens.
 * Starter cannot run them unless they have a generation pass.
 */
export async function assertHeavyBuildAllowed(
    quota: GenerationQuota,
): Promise<void> {
    if (quota.plan === 'pro' || quota.plan === 'premium') return;
    if (quota.passes > 0) return;

    throw new ApiError(
        'payment_required',
        'This description needs a custom AI build. Upgrade to Pro or Premium on User Plans.',
    );
}
