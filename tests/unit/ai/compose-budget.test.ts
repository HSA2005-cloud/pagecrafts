import { describe, expect, it } from 'vitest';

import { customBuildFits, estimateSiteBuild } from '@/lib/ai/generate/complexity';

const custom = estimateSiteBuild(
    'Build me a web app with a cart and checkout and an admin dashboard',
);
const recipe = estimateSiteBuild('A sweet shop in Old Delhi');

describe('a custom compose is only attempted when it can actually finish', () => {
    it('recognises the two modes', () => {
        expect(custom.mode).toBe('custom');
        expect(recipe.mode).toBe('recipe');
    });

    it('never blocks the recipe path, whatever the budget', () => {
        expect(customBuildFits(recipe, { composeMaxTokens: 1, tpm: 1 })).toBe(true);
    });

    it('refuses the Groq free tier, where one call cannot hold a whole site', () => {
        expect(customBuildFits(custom, { composeMaxTokens: 6_000, tpm: 8_000 })).toBe(false);
    });

    it('refuses a ceiling that does not fit under the per-minute limit', () => {
        expect(customBuildFits(custom, { composeMaxTokens: 12_000, tpm: 8_000 })).toBe(false);
    });

    it('allows a paid tier with room for the whole reply', () => {
        expect(customBuildFits(custom, { composeMaxTokens: 12_000, tpm: 100_000 })).toBe(true);
    });

    it('treats an unset per-minute limit as no limit', () => {
        expect(customBuildFits(custom, { composeMaxTokens: 12_000, tpm: 0 })).toBe(true);
    });
});
