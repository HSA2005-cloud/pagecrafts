import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '@/lib/errors/respond';
import { hasAdvanced } from '@/lib/data/entitlements';
import { redis, isRedisConfigured } from '@/lib/limits/redis';
import {
    ADVANCED_GENERATIONS_PER_PROJECT,
    FREE_GENERATIONS_PER_PROJECT,
} from '@/lib/limits/config';
import type { AiPackageId } from '@/lib/payments/packages';
import { generationsLimitForPackage } from '@/lib/payments/packages';

export type GenerationQuota = {
    used: number;
    limit: number;
    /** Generations left in the included package allowance (not counting paid passes). */
    remaining: number;
    /** Kept for older clients — always false; Advanced raises the limit, it does not remove it. */
    unlimited: boolean;
    package: AiPackageId;
    /** One-round passes left (Rs 199 each). */
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
                'You need an extra generation pass before you can generate again.',
            );
        }
    }

    return bumpGenerationUsed(projectId);
}

/**
 * Record a generation. Heavy builds on the Free package always spend a pass
 * (they are not included in the three free standard rounds).
 */
export async function recordGenerationUseForBuild(
    projectId: string,
    userId: string,
    quota: GenerationQuota,
    heavy: boolean,
): Promise<number> {
    if (heavy && quota.package === 'free') {
        const spent = await consumeGenerationPass(userId);
        if (!spent) {
            throw new ApiError(
                'payment_required',
                'This description needs a custom AI build. Buy an extra generation pass (Rs 199), or upgrade to Advanced.',
            );
        }
        return bumpGenerationUsed(projectId);
    }
    return recordFreeGeneration(projectId, userId, quota.limit);
}

async function accountPackage(
    supabase: SupabaseClient,
    userId: string,
): Promise<AiPackageId> {
    try {
        return (await hasAdvanced(supabase, userId)) ? 'advanced' : 'free';
    } catch {
        return 'free';
    }
}

export async function readGenerationQuota(
    projectId: string,
    userId: string,
    supabase: SupabaseClient,
): Promise<GenerationQuota> {
    const pkg = await accountPackage(supabase, userId);
    const limit = generationsLimitForPackage(pkg);
    const used = await freeGenerationsUsed(projectId);
    const passes = await generationPassesRemaining(userId);
    const remaining = Math.max(0, limit - used);
    return {
        used,
        limit,
        remaining,
        unlimited: false,
        package: pkg,
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

    if (quota.package === 'free') {
        throw new ApiError(
            'payment_required',
            `You have used your ${quota.limit} Free AI generations on this site. Upgrade to Advanced for ${ADVANCED_GENERATIONS_PER_PROJECT} generations, or buy an extra generation pass.`,
        );
    }

    throw new ApiError(
        'payment_required',
        `You have used your ${quota.limit} Advanced AI generations on this site. Buy an extra generation pass (Rs 199) for one more round with three looks.`,
    );
}

/**
 * Heavy / custom builds (carts, apps, multi-file JS) cost more tokens.
 * Free package cannot run them unless they have a generation pass.
 * Advanced (or a pass) is required.
 */
export async function assertHeavyBuildAllowed(
    quota: GenerationQuota,
): Promise<void> {
    if (quota.package === 'advanced') return;
    if (quota.passes > 0) return;

    throw new ApiError(
        'payment_required',
        'This description needs a custom AI build (more tokens than a standard site). Upgrade to Advanced, or buy an extra generation pass (Rs 199).',
    );
}
