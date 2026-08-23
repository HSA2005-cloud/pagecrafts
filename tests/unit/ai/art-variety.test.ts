import { describe, expect, it } from 'vitest';

import {
    artSeed,
    paletteSize,
    variedArtDirection,
    variedSpec,
    variedVariants,
} from '@/lib/ai/generate/art-variety';
import { STYLE_IDS, STYLE_SPECS } from '@/lib/ai/generate/styles';
import { buildStyleOptions } from '@/lib/ai/generate/options';
import { SCHEMA_VERSION, type Composition, type SectionInstance } from '@/lib/contracts';

// STYLE_SPECS pinned each look to one ArtDirection, so every Photo-rich site in the product
// shared a theme, a motion, a radius, a spacing and an imagery treatment. Two restaurants
// got the same site with different words in it -- the thing the Rs 499 tier is sold as not
// being. The catalogue was always 3,600 combinations deep; the product used three.

function section(type: SectionInstance['type'], props: Record<string, unknown>): SectionInstance {
    return {
        id: `s_${type}`, type, variant: 'centred', brief: 'test',
        visible: true, locked: false, source: 'ai', props,
    };
}

function compositionFor(title: string, vertical: string): Composition {
    return {
        schemaVersion: SCHEMA_VERSION,
        vertical,
        artDirection: {
            themeId: 'calm-sage', motionId: 'whisper', radiusId: 'soft',
            spacingId: 'airy', imageryId: 'warm-natural',
        },
        meta: { title, description: `${title} in Bengaluru`, lang: 'en' },
        sections: [
            section('hero', { heading: title, sub: 'x', ctaLabel: 'Go', image: {} }),
            section('about', { heading: 'About', body: 'x' }),
            section('services', { heading: 'What we do', items: [{ title: 'A', body: 'b' }] }),
            section('contact', { heading: 'Find us' }),
            section('footer', { heading: title }),
        ],
    };
}

const fingerprint = (a: ReturnType<typeof variedArtDirection>) =>
    [a.themeId, a.motionId, a.radiusId, a.spacingId, a.imageryId].join('/');

describe('no two businesses get the same design', () => {
    it('gives twenty different businesses more than one look between them', () => {
        const seen = new Set(
            Array.from({ length: 20 }, (_, i) =>
                fingerprint(variedArtDirection('photos', artSeed({ title: `Business ${i}`, vertical: 'restaurant' }))),
            ),
        );

        // Twenty draws from a pool this size collide sometimes; one or two is fine, three
        // distinct results out of twenty would mean the seeding is not working.
        expect(seen.size).toBeGreaterThan(12);
    });

    it('varies the layout too, not only the colours', () => {
        const heroes = new Set(
            Array.from({ length: 20 }, (_, i) =>
                variedVariants('photos', artSeed({ title: `Cafe ${i}`, vertical: 'cafe' })).hero,
            ),
        );

        expect(heroes.size).toBeGreaterThan(1);
    });

    it('gives the same business the same site twice, so a reload is not a redesign', () => {
        const seed = artSeed({ title: 'Savor & Stir', vertical: 'restaurant', jobId: 'job_1' });

        expect(fingerprint(variedArtDirection('photos', seed)))
            .toBe(fingerprint(variedArtDirection('photos', seed)));
    });

    it('gives a different site when they ask for another look', () => {
        const one = artSeed({ title: 'Savor & Stir', vertical: 'restaurant', jobId: 'job_1' });
        const two = artSeed({ title: 'Savor & Stir', vertical: 'restaurant', jobId: 'job_2' });

        expect(one).not.toBe(two);
    });
});

describe('each tier keeps its character while it varies', () => {
    // A free look that animates like the paid one is a free look nobody upgrades from.
    it('never lets Casual run kinetic', () => {
        for (let i = 0; i < 40; i += 1) {
            const art = variedArtDirection('casual', artSeed({ title: `Shop ${i}`, vertical: 'retail' }));
            expect(['none', 'whisper']).toContain(art.motionId);
        }
    });

    it('never lets Animated stand still', () => {
        for (let i = 0; i < 40; i += 1) {
            const art = variedArtDirection('motion', artSeed({ title: `Shop ${i}`, vertical: 'retail' }));
            expect(['kinetic', 'showcase', 'editorial']).toContain(art.motionId);
        }
    });

    it('keeps Photo-rich on a hero that can carry a photograph', () => {
        for (let i = 0; i < 40; i += 1) {
            const hero = variedVariants('photos', artSeed({ title: `Shop ${i}`, vertical: 'retail' })).hero;
            expect(['image-bg', 'split-image', 'centred']).toContain(hero);
        }
    });

    // A variant the renderer does not know renders as the section default, which would
    // quietly undo the variety it was added for.
    it('only ever picks a variant the renderer knows', () => {
        const KNOWN: Record<string, string[]> = {
            hero: ['centred', 'split-image', 'image-bg', 'minimal'],
            about: ['text', 'media-split'],
            services: ['cards', 'grid', 'timeline'],
            menu: ['grouped', 'simple'],
            gallery: ['masonry', 'grid', 'carousel'],
            team: ['cards', 'grid'],
            testimonials: ['quotes', 'cards'],
            faq: ['accordion', 'two-column'],
            contact: ['split-map', 'simple', 'form'],
            footer: ['simple', 'columns'],
        };

        for (const id of STYLE_IDS) {
            for (let i = 0; i < 20; i += 1) {
                const chosen = variedVariants(id, artSeed({ title: `S${i}`, vertical: 'retail' }));
                for (const [section, variant] of Object.entries(chosen)) {
                    expect(KNOWN[section], `${id} picked an unknown section ${section}`).toBeTruthy();
                    expect(KNOWN[section], `${id}.${section} = ${variant}`).toContain(variant);
                }
            }
        }
    });

    it('leaves the spec untouched when there is no seed', () => {
        for (const id of STYLE_IDS) {
            expect(variedSpec(STYLE_SPECS[id], '')).toBe(STYLE_SPECS[id]);
        }
    });

    it('offers enough combinations to stand behind "no two the same"', () => {
        expect(paletteSize('photos')).toBeGreaterThan(100_000);
        expect(paletteSize('motion')).toBeGreaterThan(1_000);
    });
});

describe('the generator actually uses it', () => {
    it('builds two different restaurants into two different sites', async () => {
        const a = await buildStyleOptions(compositionFor('Savor & Stir', 'restaurant'), undefined, undefined, 'job_a');
        const b = await buildStyleOptions(compositionFor('Copper Pot', 'restaurant'), undefined, undefined, 'job_b');

        const artOf = (o: Awaited<ReturnType<typeof buildStyleOptions>>) =>
            o.map((x) => fingerprint(x.composition.artDirection)).join(' ');

        expect(artOf(a)).not.toBe(artOf(b));
    });

    it('still returns the three looks, in order, with their prices', async () => {
        const options = await buildStyleOptions(compositionFor('Savor & Stir', 'restaurant'), undefined, undefined, 'job_a');

        expect(options.map((o) => o.id)).toEqual(['casual', 'photos', 'motion']);
        expect(options.map((o) => o.tier)).toEqual(['free', 'pro', 'premium']);
        expect(options.map((o) => o.priceInr)).toEqual([0, 499, 999]);
    });

    it('writes a real page for each look', async () => {
        const options = await buildStyleOptions(compositionFor('Savor & Stir', 'restaurant'), undefined, undefined, 'job_a');

        for (const option of options) {
            expect(option.files['index.html'], option.id).toContain('Savor &amp; Stir');
            expect(option.files['index.html'], option.id).toContain(`data-style="${option.id}"`);
        }
    });
});
