import { describe, expect, it } from 'vitest';

import { artSeed, paletteSize, variedArtDirection } from '@/lib/ai/generate/art-variety';
import { STYLE_IDS, type StyleId } from '@/lib/ai/generate/styles';
import type { ArtDirection } from '@/lib/contracts';

// Theme, radius, spacing and imagery are drawn as one curated set, never independently.
// Four separate rolls gave 3,600 combinations with no floor under any of them: warm cream
// on one draw, grey documentary on tight slate the next. Both "varied", one worth selling.
//
// A theme can appear in more than one mood — warm-editorial is both the plain Free "note"
// and the airy Pro "editorial" — so the check is membership of the tuple, not a lookup.
const MOOD_TUPLES = new Set([
    'mono-precision/soft/default/bright-clean',
    'warm-editorial/soft/default/bright-clean',
    'clinical-blue/soft/default/bright-clean',
    'warm-editorial/soft/airy/warm-natural',
    'sunlit-craft/organic/airy/bright-clean',
    'calm-sage/organic/airy/warm-natural',
    'clinical-blue/framed/airy/bright-clean',
    'mono-precision/sharp/airy/documentary',
    'deep-luxury/framed/airy/muted-duotone',
    'tech-slate/sharp/tight/bold-contrast',
    'vivid-energy/pill/tight/bold-contrast',
]);

const seedFor = (i: number) =>
    artSeed({ title: `Business ${i}`, vertical: 'restaurant', jobId: `job_${i}` });

const moodOf = (a: ArtDirection) => `${a.themeId}/${a.radiusId}/${a.spacingId}/${a.imageryId}`;
const fingerprint = (a: ArtDirection) => `${moodOf(a)}/${a.motionId}`;

describe('every draw is a set somebody chose, not four independent rolls', () => {
    it.each(STYLE_IDS)('%s only ever emits curated pairings', (styleId) => {
        for (let i = 0; i < 300; i += 1) {
            const art = variedArtDirection(styleId, seedFor(i));
            expect(MOOD_TUPLES.has(moodOf(art)), `${styleId} drew ${moodOf(art)}`).toBe(true);
        }
    });
});

// The ladder has to read Free < Pro < Premium at a glance, or the free tier is the reason
// nobody upgrades. Free stays flat and still; Premium never goes light and quiet.
describe('the tiers do not overlap', () => {
    const drawsFor = (styleId: StyleId) =>
        Array.from({ length: 300 }, (_, i) => variedArtDirection(styleId, seedFor(i)));

    it('Free never animates and never draws a rich, airy look', () => {
        for (const art of drawsFor('casual')) {
            expect(art.motionId).toBe('none');
            expect(art.spacingId).toBe('default');
            expect(art.imageryId).toBe('bright-clean');
        }
    });

    it('Pro always moves at least a little and always keeps a hero photograph', () => {
        for (const art of drawsFor('photos')) {
            expect(['whisper', 'calm', 'editorial', 'showcase']).toContain(art.motionId);
            expect(art.motionId).not.toBe('none');
        }
    });

    it('Premium stays dark and kinetic', () => {
        for (const art of drawsFor('motion')) {
            expect(['kinetic', 'showcase']).toContain(art.motionId);
            expect(['deep-luxury', 'tech-slate', 'vivid-energy']).toContain(art.themeId);
        }
    });

    it('no look belongs to two tiers', () => {
        const set = (id: StyleId) => new Set(drawsFor(id).map(fingerprint));
        const casual = set('casual');
        const photos = set('photos');
        const motion = set('motion');

        for (const look of casual) expect(photos.has(look), look).toBe(false);
        for (const look of photos) expect(motion.has(look), look).toBe(false);
    });
});

// FNV-1a leaves its low bits correlated with the last bytes of the input. Taking `% 8` or
// `% 4` reads exactly those bits, so half the moods and half the motions were unreachable
// however many businesses signed up. The finaliser in hash() is what makes this pass.
describe('the whole catalogue is reachable, not just the lucky half', () => {
    it.each([
        ['casual', 3],
        ['photos', 20],
        ['motion', 6],
    ] as const)('%s reaches all %i art directions', (styleId, total) => {
        const seen = new Set<string>();
        for (let i = 0; i < 600; i += 1) seen.add(fingerprint(variedArtDirection(styleId, seedFor(i))));

        expect(seen.size).toBe(total);
    });

    it('spreads them evenly rather than piling onto one', () => {
        const counts = new Map<string, number>();
        const runs = 800;
        for (let i = 0; i < runs; i += 1) {
            const look = moodOf(variedArtDirection('photos', seedFor(i)));
            counts.set(look, (counts.get(look) ?? 0) + 1);
        }

        // Five moods over 800 draws is ~160 each; a hash this broken produced 0 or 177.
        for (const [look, n] of counts) {
            expect(n, `${look} drawn ${n} times`).toBeGreaterThan(60);
            expect(n, `${look} drawn ${n} times`).toBeLessThan(220);
        }
    });
});

describe('the promise on the pricing page still holds', () => {
    // Tightening each tier so the ladder reads correctly costs raw combinations. What is
    // left is still far past the point any real customer list would collide.
    it('keeps enough distinct designs in the paid tiers', () => {
        // Hero is locked to image-bg so every Pro site opens cinematic; the rest of the
        // catalogue still clears ten thousand distinct designs.
        expect(paletteSize('photos')).toBeGreaterThan(10_000);
        expect(paletteSize('motion')).toBeGreaterThan(500);
    });

    it('gives one business the same design every time', () => {
        const seed = artSeed({ title: '1522 Hotel', vertical: 'restaurant', jobId: 'job_1' });

        for (const styleId of STYLE_IDS) {
            expect(fingerprint(variedArtDirection(styleId, seed)))
                .toBe(fingerprint(variedArtDirection(styleId, seed)));
        }
    });
});
