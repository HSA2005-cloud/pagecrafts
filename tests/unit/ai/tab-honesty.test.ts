import { describe, expect, it } from 'vitest';

import { compositionToFiles } from '@/lib/ai/generate/to-files';
import { SCHEMA_VERSION, type Composition, type SectionInstance } from '@/lib/contracts';

// Menu and gallery tabs were built once and taken back out. Both had to invent their
// categories, because the section contract carries none:
//
//   menu item    -> name, description, price
//   gallery image -> query, alt
//
// Labelling the first third of a menu "Starters & Mains" states something about the food
// that nothing in the data supports — the model emits items in whatever order it likes, so
// the dessert lands under starters as often as not. Splitting photos into "Featured" and
// "Highlights" is worse: every image is repeated under a second copy of the same data-slot,
// and slotPattern() in src/lib/content/slots.ts has no /g flag, so an edit updates the first
// copy and the second goes stale on the same page.
//
// If a category field ever lands on the contract, delete this file and build the tabs.

const section = (
    type: SectionInstance['type'],
    variant: string,
    props: Record<string, unknown>,
): SectionInstance => ({
    id: `s_${type}`, type, variant, brief: 'test',
    visible: true, locked: false, source: 'ai', props,
});

const composition: Composition = {
    schemaVersion: SCHEMA_VERSION,
    vertical: 'restaurant',
    artDirection: {
        themeId: 'deep-luxury', motionId: 'kinetic', radiusId: 'framed',
        spacingId: 'airy', imageryId: 'muted-duotone',
    },
    meta: { title: 'Savour & Stir', description: 'Fine dining', lang: 'en' },
    sections: [
        section('hero', 'image-bg', { heading: 'Savour & Stir', image: { query: 't', alt: 'A' } }),
        // Deliberately out of course order, the way a model actually returns them.
        section('menu', 'grouped', {
            heading: 'Menu',
            items: [
                { name: 'Gulab jamun', description: 'Dessert', price: '180' },
                { name: 'Tomato soup', description: 'Starter', price: '220' },
                { name: 'Biryani', description: 'Main', price: '480' },
                { name: 'Filter coffee', description: 'Drink', price: '90' },
                { name: 'Seekh kebab', description: 'Starter', price: '340' },
                { name: 'Lamb curry', description: 'Main', price: '520' },
            ],
        }),
        section('gallery', 'carousel', {
            heading: 'The room',
            images: [1, 2, 3, 4].map((i) => ({
                query: `q${i}`, alt: `Photo ${i}`, url: `https://images.unsplash.com/${i}`,
            })),
        }),
        section('footer', 'simple', { tagline: 'Savour & Stir' }),
    ],
};

const INVENTED = /Starters &amp; Mains|Specialties|Desserts &amp; Drinks|Chef|Popular|All Photos|Featured|Highlights/;

describe.each(['photos', 'motion'] as const)('%s never invents a category', (style) => {
    const files = compositionToFiles(composition, style, 'seed');
    const all = Object.values(files).join('\n');

    it('puts no made-up group name on the page', () => {
        expect(all).not.toMatch(INVENTED);
    });

    it('never repeats a data-slot, so an edit cannot go half-applied', () => {
        for (const [path, html] of Object.entries(files)) {
            const slots = [...html.matchAll(/data-slot="([^"]+)"/g)].map((m) => m[1]);
            const seen = new Map<string, number>();
            for (const s of slots) seen.set(s, (seen.get(s) ?? 0) + 1);

            const repeated = [...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s);
            expect(repeated, `${path} repeats ${repeated.join(', ')}`).toEqual([]);
        }
    });

    it('renders each photograph exactly once', () => {
        expect((all.match(/images\.unsplash\.com\/[1-4]"/g) ?? []).length).toBe(4);
    });

    it('keeps every menu item on the page', () => {
        for (const name of ['Gulab jamun', 'Tomato soup', 'Biryani', 'Lamb curry']) {
            expect(all).toContain(name);
        }
    });
});

describe('the premium float cards say nothing they were not given', () => {
    const premium = Object.values(compositionToFiles(composition, 'motion', 'seed')).join('\n');

    it('carries no copy nobody wrote', () => {
        expect(premium).not.toMatch(/Live 3D Experience|Dynamic Motion|Interactive stage|Fluid depth/);
    });

    it('still ships both cards, leaning different ways', () => {
        expect(premium).toContain('motion-float-card-a');
        expect(premium).toContain('motion-float-card-b');
        expect(premium).toContain('--ry: 16deg');
        expect(premium).toContain('--ry: -14deg');
    });

    // A static transform on the element loses to the keyframes, which is how both cards
    // ended up leaning the same way the first time.
    it('drives the tilt through the keyframes, not a transform the animation overwrites', () => {
        expect(premium).toMatch(/rotateY\(var\(--ry\)\)/);
        expect(premium).not.toMatch(/motion-float-card-a \{[^}]*transform: perspective/);
    });

    it('stops the cards under reduced motion', () => {
        expect(premium).toContain('.motion-float-card { animation: none; transform: none !important; }');
    });
});
