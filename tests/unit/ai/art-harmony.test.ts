import { describe, expect, it } from 'vitest';

import { artSeed, paletteSize, variedArtDirection } from '@/lib/ai/generate/art-variety';
import { STYLE_IDS } from '@/lib/ai/generate/styles';
import type { ArtDirection } from '@/lib/contracts';

// Theme, radius, spacing and imagery are drawn as one curated set, never independently.
// Four separate rolls gave 3,600 combinations with no floor under any of them: warm cream
// on one draw, grey documentary on tight slate the next. Both "varied", one worth selling.
const HARMONY: Record<string, [ArtDirection['radiusId'], ArtDirection['spacingId'], ArtDirection['imageryId']]> = {
    'warm-editorial': ['soft', 'airy', 'warm-natural'],
    'sunlit-craft': ['organic', 'airy', 'bright-clean'],
    'calm-sage': ['organic', 'airy', 'warm-natural'],
    'clinical-blue': ['soft', 'default', 'bright-clean'],
    'mono-precision': ['sharp', 'default', 'documentary'],
    'deep-luxury': ['framed', 'airy', 'muted-duotone'],
    'tech-slate': ['sharp', 'tight', 'bold-contrast'],
    'vivid-energy': ['pill', 'tight', 'bold-contrast'],
};

const seedFor = (i: number) =>
    artSeed({ title: `Business ${i}`, vertical: 'restaurant', jobId: `job_${i}` });

const fingerprint = (a: ArtDirection) =>
    `${a.themeId}/${a.motionId}/${a.radiusId}/${a.spacingId}/${a.imageryId}`;

describe('every draw is a set somebody chose, not four independent rolls', () => {
    it.each(STYLE_IDS)('%s only ever emits curated pairings', (styleId) => {
        for (let i = 0; i < 300; i += 1) {
            const art = variedArtDirection(styleId, seedFor(i));
            const want = HARMONY[art.themeId];

            expect(want, `${art.themeId} is not a curated mood`).toBeTruthy();
            expect([art.radiusId, art.spacingId, art.imageryId], fingerprint(art)).toEqual(want);
        }
    });
});

// FNV-1a leaves its low bits correlated with the last bytes of the input. Taking `% 8` or
// `% 4` reads exactly those bits, so half the moods and half the motions were unreachable
// however many businesses signed up. The finaliser in hash() is what makes this pass.
describe('the whole catalogue is reachable, not just the lucky half', () => {
    it.each([
        ['casual', 10],
        ['photos', 32],
        ['motion', 15],
    ] as const)('%s reaches all %i art directions', (styleId, total) => {
        const seen = new Set<string>();
        for (let i = 0; i < 600; i += 1) seen.add(fingerprint(variedArtDirection(styleId, seedFor(i))));

        expect(seen.size).toBe(total);
    });

    it('spreads them evenly rather than piling onto one', () => {
        const counts = new Map<string, number>();
        const runs = 800;
        for (let i = 0; i < runs; i += 1) {
            const theme = variedArtDirection('photos', seedFor(i)).themeId;
            counts.set(theme, (counts.get(theme) ?? 0) + 1);
        }

        // Eight moods over 800 draws is 100 each; a hash this broken produced 0 or 177.
        for (const [theme, n] of counts) {
            expect(n, `${theme} drawn ${n} times`).toBeGreaterThan(40);
            expect(n, `${theme} drawn ${n} times`).toBeLessThan(180);
        }
    });
});

describe('the promise on the pricing page still holds', () => {
    it('keeps enough distinct designs per tier', () => {
        expect(paletteSize('photos')).toBeGreaterThan(100_000);
        expect(paletteSize('motion')).toBeGreaterThan(1_000);
        expect(paletteSize('casual')).toBeGreaterThan(100);
    });

    it('gives one business the same design every time', () => {
        const seed = artSeed({ title: '1522 Hotel', vertical: 'restaurant', jobId: 'job_1' });

        for (const styleId of STYLE_IDS) {
            expect(fingerprint(variedArtDirection(styleId, seed)))
                .toBe(fingerprint(variedArtDirection(styleId, seed)));
        }
    });
});
