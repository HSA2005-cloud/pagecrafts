import { describe, expect, it } from 'vitest';

import { customBuildFits, estimateSiteBuild, isHeavyBuild } from '@/lib/ai/generate/complexity';

// The generate route asks two questions before it charges anybody: is this a heavy build,
// and can a heavy build actually run here. Both have to be true.
//
// They came apart once. estimateSiteBuild saw "booking system", called it custom, and the
// route demanded an upgrade — while the runner, checking the same budget, quietly dropped to
// the section recipe because one compose call cannot fit in Groq's free 8,000 TPM. Somebody
// would have paid Rs 499 for a build the system was never going to attempt.

const chargeable = (prompt: string, composeMaxTokens: number, tpm: number) => {
    const estimate = estimateSiteBuild(prompt);
    return isHeavyBuild(estimate) && customBuildFits(estimate, { composeMaxTokens, tpm });
};

const APP_LIKE = 'Cooking classes in Bengaluru. Add class filtering and a simple booking '
    + 'system where users can select a class, date and time.';
const ORDINARY = 'A cooking class studio in Bengaluru with photographs of the kitchen.';

const FREE_TIER = { compose: 6_000, tpm: 8_000 };
const PAID_TIER = { compose: 12_000, tpm: 100_000 };

describe('nobody is asked to upgrade for a build that cannot run', () => {
    it('does not charge for the compose path on the Groq free tier', () => {
        expect(chargeable(APP_LIKE, FREE_TIER.compose, FREE_TIER.tpm)).toBe(false);
    });

    it('does not charge when the ceiling is too big to fit under the per-minute limit', () => {
        expect(chargeable(APP_LIKE, 12_000, 8_000)).toBe(false);
    });

    it('still recognises the prompt as heavy — it is the budget that says no', () => {
        expect(isHeavyBuild(estimateSiteBuild(APP_LIKE))).toBe(true);
    });
});

describe('a real custom build is still gated', () => {
    it('charges on a tier with room for the whole reply', () => {
        expect(chargeable(APP_LIKE, PAID_TIER.compose, PAID_TIER.tpm)).toBe(true);
    });

    it('charges when no per-minute limit is published', () => {
        expect(chargeable(APP_LIKE, 12_000, 0)).toBe(true);
    });
});

describe('an ordinary site is never gated', () => {
    it.each([
        ['free tier', FREE_TIER.compose, FREE_TIER.tpm],
        ['paid tier', PAID_TIER.compose, PAID_TIER.tpm],
    ])('stays free on the %s', (_label, compose, tpm) => {
        expect(chargeable(ORDINARY, compose, tpm)).toBe(false);
    });
});
