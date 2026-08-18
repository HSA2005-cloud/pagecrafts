import { describe, it, expect } from 'vitest';
import { compositionToFiles } from '@/lib/ai/generate/to-files';
import { SCHEMA_VERSION, type ArtDirection, type Composition, type SectionInstance } from '@/lib/contracts';
import { THEMES } from '@/lib/render/art-direction';

const ART: ArtDirection = {
    themeId: 'calm-sage', motionId: 'whisper', radiusId: 'soft',
    spacingId: 'airy', imageryId: 'warm-natural',
};

const section = (
    id: string,
    type: SectionInstance['type'],
    variant: string,
    props: Record<string, unknown>,
    visible = true,
): SectionInstance => ({
    id, type, variant, brief: 'b', visible, locked: false, source: 'ai', props,
});

const composition: Composition = {
    schemaVersion: SCHEMA_VERSION,
    vertical: 'dental-clinic',
    artDirection: ART,
    meta: { title: 'Smile Dental', description: 'Family dentistry in Koramangala', lang: 'en' },
    sections: [
        section('s_01', 'hero', 'split-image', {
            eyebrow: 'Koramangala',
            heading: 'Family dentistry',
            sub: 'Check-ups and braces.',
            ctaLabel: 'Book',
            image: { query: 'dental clinic', alt: 'Clinic waiting room' },
        }),
        section('s_02', 'services', 'cards', {
            heading: 'What we do',
            items: [{ title: 'Braces', body: 'Alignment over 18 months.' }],
        }),
        section('s_03', 'faq', 'accordion', {
            heading: 'Questions',
            items: [{ question: 'Do I need to book?', answer: 'Walk-ins until 1pm.' }],
        }),
        section('s_04', 'contact', 'simple', {
            heading: 'Find us',
            blurb: 'Open six days.',
            address: '4th Block',
            phone: '080 1234',
            email: 'hi@x.in',
            hours: '9-6',
        }),
        section('s_05', 'footer', 'simple', { tagline: 'Smile Dental · Koramangala' }),
        section('s_hidden', 'about', 'text', { heading: 'Hidden', body: 'Should not render.' }, false),
    ],
};

describe('compositionToFiles — D15, a composition becomes a site', () => {
    const files = compositionToFiles(composition);
    const html = files['index.html'];

    it('writes a single index.html', () => {
        expect(Object.keys(files)).toEqual(['index.html']);
        expect(html).toMatch(/^<!doctype html>/i);
    });

    it('puts every art-direction dial on the page', () => {
        expect(html).toContain(THEMES['calm-sage'].accent);
        expect(html).toContain('data-motion="whisper"');
        expect(html).toContain('--section-gap:');
        expect(html).toContain('--image-filter:');
    });

    it('renders visible sections and skips hidden ones', () => {
        expect(html).toContain('id="hero"');
        expect(html).toContain('data-section-id="s_01"');
        expect(html).toContain('data-type="hero"');
        expect(html).toContain('Family dentistry');
        expect(html).toContain('Do I need to book?');
        expect(html).toContain('hi@x.in');
        expect(html).not.toContain('Should not render.');
        expect(html).not.toContain('id="s_hidden"');
    });

    it('adds a nav so in-page links stay on the preview', () => {
        // Written against the other renderer and never able to pass here. It asked for
        // `href="#s_01"` — the hero's section id — and this nav deliberately leaves the hero
        // out, linking a wordmark to #top instead; and `href="#s_04"`, where this renderer
        // anchors a unique section by its type, so contact is `#contact`. That is what
        // "links every content page from the header" below asserts, and the two could never
        // both hold. It sat red for two days.
        //
        // Kept, narrowed to what this renderer does guarantee and the test below does not:
        // the nav is there, it carries the site's name, and its wordmark goes to the top.
        expect(html).toContain('class="site-nav"');
        expect(html).toContain('href="#top"');
        expect(html).toContain('Smile Dental');
        expect(html).toContain('<main id="top">');
    });

    it('escapes copy so a heading cannot break out of the markup', () => {
        const hostile = compositionToFiles({
            ...composition,
            sections: [section('s_01', 'hero', 'centred', {
                heading: '<script>alert(1)</script>',
                sub: 'ok',
            })],
        });
        expect(hostile['index.html']).toContain('&lt;script&gt;');
        expect(hostile['index.html']).not.toContain('<script>alert(1)</script>');
    });

    it('keeps image queries as slots, not invented Unsplash URLs', () => {
        expect(html).toContain('data-query="dental clinic"');
        expect(html).not.toContain('images.unsplash.com');
    });

    it('is a working page: nav, CTA, form, and accordion', () => {
        expect(html).toContain('href="#contact"');
        expect(html).toContain('class="cta"');
        expect(html).toContain('<form class="form"');
        expect(html).toContain('type="email"');
        expect(html).toContain('<button type="submit">');
        expect(html).toContain('<details class="faq-item">');
        expect(html).toContain('class="cards"');
        expect(html).toContain('class="card"');
    });

    it('marks sections for the motion observer', () => {
        expect(html).toContain('data-animate');
        expect(html).toContain('IntersectionObserver');
    });

    it('links every content page from the header', () => {
        expect(html).toContain('aria-label="Site"');
        expect(html).toContain('href="#services"');
        expect(html).toContain('href="#faq"');
        expect(html).toContain('href="#contact"');
        expect(html).toContain('>Services<');
        expect(html).toContain('>FAQ<');
        expect(html).toContain('>Contact<');
    });

    it('only emits fragment links with matching page anchors', () => {
        const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
        const fragments = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
        expect(fragments.length).toBeGreaterThan(0);
        expect(fragments.every((fragment) => ids.has(fragment))).toBe(true);
    });

    it('tags copy with data-slot so the content panel can edit it', () => {
        expect(html).toContain('data-slot="hero.heading"');
        expect(html).toContain('data-slot="services.items.0.title"');
        expect(html).toContain('data-slot="contact.email"');
        expect(html).toContain('data-slot="hero.image"');
    });

    it('renders a real photograph when the slot has a url', () => {
        const withPhoto = compositionToFiles({
            ...composition,
            sections: [section('s_01', 'hero', 'image-bg', {
                heading: 'Family dentistry',
                image: { query: 'dental clinic', alt: 'Waiting room', url: 'https://images.unsplash.com/photo-x?w=1600' },
            })],
        }, 'photos');
        expect(withPhoto['index.html']).toContain('src="https://images.unsplash.com/photo-x?w=1600"');
        expect(withPhoto['index.html']).toContain('data-style="photos"');
    });
});
