import { describe, expect, it } from 'vitest';

import { buildStyleOptions } from '@/lib/ai/generate/options';
import { SCHEMA_VERSION, type Composition, type SectionInstance } from '@/lib/contracts';

// Free was the best-looking tier: warm cream, a real photograph, airy spacing, while Pro
// drew a flat grey hero. The ladder has to read Free < Pro < Premium in the markup, not
// just in the price list.

function section(type: SectionInstance['type'], props: Record<string, unknown>): SectionInstance {
    return {
        id: `s_${type}`, type, variant: 'centred', brief: 'test',
        visible: true, locked: false, source: 'ai', props,
    };
}

const composition: Composition = {
    schemaVersion: SCHEMA_VERSION,
    vertical: 'restaurant',
    artDirection: {
        themeId: 'calm-sage', motionId: 'whisper', radiusId: 'soft',
        spacingId: 'airy', imageryId: 'warm-natural',
    },
    meta: { title: 'Savour & Stir', description: 'Fine dining in Bengaluru', lang: 'en' },
    sections: [
        section('hero', { heading: 'Savour & Stir', sub: 'Fine dining', ctaLabel: 'Reserve', image: { query: 'restaurant table', alt: 'A table' } }),
        section('services', {
            heading: 'What we do',
            items: [
                { title: 'Dinner', body: 'Seven courses.' },
                { title: 'Private dining', body: 'Up to twenty.' },
                { title: 'Events', body: 'We cater.' },
            ],
        }),
        section('gallery', { heading: 'The room', images: [{ query: 'dining room', alt: 'Room' }] }),
        section('contact', { heading: 'Find us', blurb: 'Indiranagar.' }),
        section('footer', { tagline: 'Savour & Stir' }),
    ],
};

const build = () => buildStyleOptions(composition, undefined, undefined, 'job_ladder');
const htmlOf = (options: Awaited<ReturnType<typeof build>>, id: string) =>
    Object.values(options.find((o) => o.id === id)!.files).join('\n');

describe('the free tier stays plain', () => {
    it('ships no tabs, no glow and no extra script', async () => {
        const casual = htmlOf(await build(), 'casual');

        expect(casual).not.toContain('data-tabs');
        expect(casual).not.toContain('pc-glow');
        expect(casual).not.toContain('data-fx');
        expect(casual).toContain('data-motion="none"');
    });

    it('still shows one photograph, so it does not look broken', async () => {
        const casual = htmlOf(await build(), 'casual');

        expect(casual).toContain('images.unsplash.com');
    });
});

describe('Pro earns its Rs 499', () => {
    it('gives the visitor something to click', async () => {
        const photos = htmlOf(await build(), 'photos');

        expect(photos).toContain('data-tabs');
        expect(photos).toContain('role="tablist"');
        expect(photos).toContain('role="tabpanel"');
    });

    it('always puts a photograph in the hero', async () => {
        const photos = htmlOf(await build(), 'photos');
        const hero = photos.match(/data-type="hero" data-variant="([a-z-]+)"/)?.[1] ?? '';

        expect(hero).toBe('image-bg');
        expect(photos).toContain('images.unsplash.com');
        expect(photos).toMatch(/\[data-style="photos"\] \[data-type="hero"\][\s\S]*?min-height:\s*100svh/);
        expect(photos).toMatch(/\[data-style="photos"\] main[\s\S]*?padding-inline:\s*0/);
    });

    it('leaves the premium chrome to Premium', async () => {
        const photos = htmlOf(await build(), 'photos');

        expect(photos).not.toContain('pc-glow');
        expect(photos).not.toContain('data-fx');
    });
});

describe('Premium is the experience it is sold as', () => {
    it('carries the glow, the reveals, the depth and the moving images', async () => {
        const motion = htmlOf(await build(), 'motion');

        expect(motion).toContain('pc-glow');
        expect(motion).toContain('pc-in');
        expect(motion).toContain('--pc-depth');
        expect(motion).toContain('pc-drift');
        expect(motion).toContain('IntersectionObserver');
    });

    it('keeps the cursor effects it already had', async () => {
        const motion = htmlOf(await build(), 'motion');

        expect(motion).toMatch(/data-fx="[a-z ]+"/);
    });

    it('turns all of it off when the visitor asked for less motion', async () => {
        const motion = htmlOf(await build(), 'motion');

        expect(motion).toContain('prefers-reduced-motion');
        // The glow, the reveals and the drifting photographs each have to be named in the
        // reduced-motion block; a page that ignores the setting is an accessibility fault
        // somebody paid Rs 999 for.
        expect(motion).toContain('[data-style="motion"]::before { animation: none; }');
        expect(motion).toContain('[data-style="motion"] .img-slot img { animation: none; transform: none !important; }');
        expect(motion).toMatch(/section\[data-animate\] \{ opacity: 1 !important; transform: none !important;/);
    });
});

describe('a published page still stands on its own', () => {
    it('asks for no script or stylesheet it cannot reach', async () => {
        const options = await build();

        for (const option of options) {
            const html = option.files['index.html'] ?? '';
            expect(html, option.id).not.toMatch(/<script[^>]+src=/i);
            const nonFontStylesheets = (html.match(/<link[^>]+rel=["']?stylesheet[^>]*>/gi) ?? [])
                .filter((tag) => !tag.includes('fonts.googleapis.com'));
            expect(nonFontStylesheets, option.id).toEqual([]);
        }
    });

    it('shows every service even if the tab script never runs', async () => {
        const photos = htmlOf(await build(), 'photos');

        // The panels are in the markup; only a ready group hides the inactive ones.
        expect(photos).toContain('Private dining');
        expect(photos).toContain('[data-tabs]:not([data-ready]) .tablist { display: none; }');
    });
});
