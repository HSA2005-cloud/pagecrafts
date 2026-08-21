import { describe, expect, it } from 'vitest';

import { estimateSiteBuild, isHeavyBuild } from '@/lib/ai/generate/complexity';

describe('estimateSiteBuild', () => {
    it('keeps vague marketing briefs on the cheap recipe path', () => {
        const e = estimateSiteBuild('website for my south indian restaurant with a menu');
        expect(e.mode).toBe('recipe');
        expect(e.band).toBe('standard');
        expect(isHeavyBuild(e)).toBe(false);
    });

    it('routes cart / waiter / app asks to custom heavy', () => {
        const e = estimateSiteBuild(
            'Restaurant site with add to cart, table number, and send to waiter tickets',
        );
        expect(e.mode).toBe('custom');
        expect(e.band).toBe('heavy');
        expect(e.estimatedTokens).toBeGreaterThan(20_000);
        expect(isHeavyBuild(e)).toBe(true);
    });

    it('treats dashboards and login portals as heavy', () => {
        const e = estimateSiteBuild('Build me an admin dashboard with a login page');
        expect(e.mode).toBe('custom');
        expect(e.band).toBe('heavy');
    });
});
