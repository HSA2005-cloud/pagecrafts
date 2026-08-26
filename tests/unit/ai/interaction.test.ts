import { describe, expect, it } from 'vitest';

import { interactionCombinations, interactionKit } from '@/lib/ai/generate/interaction';
import { INTERACTION_IDS, interactionCss, interactionJs } from '@/lib/render/interaction-assets';
import { artSeed } from '@/lib/ai/generate/art-variety';
import { buildStyleOptions } from '@/lib/ai/generate/options';
import { SCHEMA_VERSION, type Composition, type SectionInstance } from '@/lib/contracts';

// The Rs 999 tier is sold as an experience rather than a better-looking page. Everything
// here is CSS transforms and inline vanilla JS, because a published site is one
// self-contained HTML file with a 50-file cap and no bundler — a paid page whose effects
// depend on a CDN script that might 404 is worse than a paid page with none.

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
            themeId: 'vivid-energy', motionId: 'kinetic', radiusId: 'pill',
            spacingId: 'tight', imageryId: 'bold-contrast',
        },
        meta: { title, description: `${title} in Bengaluru`, lang: 'en' },
        sections: [
            section('hero', { heading: title, sub: 'x', ctaLabel: 'Go', image: {} }),
            section('services', { heading: 'What we do', items: [{ title: 'A', body: 'b' }] }),
            section('contact', { heading: 'Find us' }),
        ],
    };
}

const seedFor = (title: string, vertical: string) => artSeed({ title, vertical, jobId: 'job_1' });

describe('only the Premium look is interactive', () => {
    // If Free and Pro got any of this, the tier would be a badge rather than a product.
    it('gives Casual and Photo-rich nothing at all', () => {
        expect(interactionKit('casual', seedFor('A', 'restaurant'), 'restaurant')).toEqual([]);
        expect(interactionKit('photos', seedFor('A', 'restaurant'), 'restaurant')).toEqual([]);
    });

    it('gives Animated three effects', () => {
        expect(interactionKit('motion', seedFor('A', 'restaurant'), 'restaurant')).toHaveLength(3);
    });

    it('gives nothing without a seed, so an unseeded render is unchanged', () => {
        expect(interactionKit('motion', '', 'restaurant')).toEqual([]);
    });
});

describe('no two Premium sites behave the same', () => {
    it('varies the kit across businesses', () => {
        const kits = new Set(
            Array.from({ length: 20 }, (_, i) =>
                interactionKit('motion', seedFor(`Business ${i}`, 'retail'), 'retail').join('+'),
            ),
        );

        expect(kits.size).toBeGreaterThan(3);
    });

    it('gives the same business the same behaviour twice', () => {
        const seed = seedFor('Savor & Stir', 'restaurant');

        expect(interactionKit('motion', seed, 'restaurant'))
            .toEqual(interactionKit('motion', seed, 'restaurant'));
    });

    // A jeweller leaning to light and a gym leaning to snap is the point; a fixed mapping
    // would make every gym identical again.
    it('leans on the trade without locking it to one answer', () => {
        const gyms = new Set(
            Array.from({ length: 12 }, (_, i) =>
                interactionKit('motion', seedFor(`Gym ${i}`, 'gym'), 'gym').join('+'),
            ),
        );

        expect(gyms.size).toBeGreaterThan(1);
    });

    it('never repeats an effect inside one kit', () => {
        for (let i = 0; i < 30; i += 1) {
            const kit = interactionKit('motion', seedFor(`S${i}`, 'retail'), 'retail');
            expect(new Set(kit).size, kit.join('+')).toBe(kit.length);
        }
    });

    it('only ever picks effects that exist', () => {
        for (let i = 0; i < 30; i += 1) {
            for (const id of interactionKit('motion', seedFor(`S${i}`, 'cafe'), 'cafe')) {
                expect(INTERACTION_IDS).toContain(id);
            }
        }
    });

    it('offers enough combinations to stand behind the claim', () => {
        expect(interactionCombinations()).toBeGreaterThan(20);
    });
});

describe('the interaction assets are safe to inline', () => {
    it('needs no script from anywhere else', () => {
        const js = interactionJs([...INTERACTION_IDS]);

        expect(js).not.toMatch(/<script|import |require\(|cdn|https?:\/\//i);
    });

    // Motion that ignores the setting is not a premium feature, it is an accessibility
    // fault somebody paid for.
    it('turns everything off under reduced motion, in both CSS and JS', () => {
        expect(interactionCss([...INTERACTION_IDS])).toContain('prefers-reduced-motion: reduce');
        expect(interactionJs([...INTERACTION_IDS])).toContain('prefers-reduced-motion: reduce');
    });

    it('leaves content readable when the effects never run', () => {
        const css = interactionCss([...INTERACTION_IDS]);
        const reduced = css.slice(css.indexOf('prefers-reduced-motion'));

        expect(reduced).toContain('opacity: 1 !important');
        expect(reduced).toContain('transform: none !important');
    });

    it('does not let one broken effect take the page down', () => {
        expect(interactionJs([...INTERACTION_IDS])).toContain('try {');
    });

    it('emits nothing at all for an empty kit', () => {
        expect(interactionCss([])).toBe('');
        expect(interactionJs([])).toBe('');
    });
});

describe('the generated Premium page carries it', () => {
    it('marks the body with the kit and ships the script', async () => {
        const options = await buildStyleOptions(
            compositionFor('Savor & Stir', 'restaurant'), undefined, undefined, 'job_1',
        );
        const motion = options.find((o) => o.id === 'motion')!;
        const html = motion.files['index.html'] ?? '';

        expect(html).toMatch(/data-fx="[a-z ]+"/);
        expect(html).toContain('prefers-reduced-motion');
    });

    it('leaves Casual and Photo-rich without a data-fx at all', async () => {
        const options = await buildStyleOptions(
            compositionFor('Savor & Stir', 'restaurant'), undefined, undefined, 'job_1',
        );

        for (const id of ['casual', 'photos'] as const) {
            const html = options.find((o) => o.id === id)!.files['index.html'] ?? '';
            expect(html, id).not.toContain('data-fx');
        }
    });

    it('stays one self-contained file — no request the page cannot make', async () => {
        const options = await buildStyleOptions(
            compositionFor('Savor & Stir', 'restaurant'), undefined, undefined, 'job_1',
        );
        const html = options.find((o) => o.id === 'motion')!.files['index.html'] ?? '';

        expect(html).not.toMatch(/<script[^>]+src=/i);
        const nonFontStylesheets = (html.match(/<link[^>]+rel=["']?stylesheet[^>]*>/gi) ?? [])
            .filter((tag) => !tag.includes('fonts.googleapis.com'));
        expect(nonFontStylesheets).toEqual([]);
    });
});
