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

// NOTE (added while unbreaking main).
//
// src/lib/ai/generate/to-files.ts was left half-merged on 2026-08-18: the editor branch's
// merge of main (548e0bf) kept both sides of the conflict, grafting that branch's helpers
// and case bodies on top of main's slot-based renderer. It did not parse, so sixteen test
// files could not even load and the whole product would not build.
//
// The file has been restored to the last version that parsed. That deliberately throws away
// real work — the editor branch's renderer emits forms, FAQ accordions, image slots and
// grids, and none of that is in the tree now.
//
// It cannot simply be adopted either: that renderer has no `data-slot` attributes at all,
// and data-slot is what the content panel edits (C-07). So one version is editable and thin,
// the other is rich and not editable, and the end state is the richer sections rendered
// *through* slot(). That is the editor track's work to re-land, and it is not a merge — it
// is a decision about what a generated site is.

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

    it('writes a multi-page site ending with Settings', () => {
        const paths = Object.keys(files);
        expect(paths).toContain('index.html');
        expect(paths).toContain('about.html');
        expect(paths).toContain('services.html');
        expect(paths).toContain('faq.html');
        expect(paths).toContain('contact.html');
        expect(paths[paths.length - 1]).toBe('settings.html');
        expect(html).toMatch(/^<!doctype html>/i);
        expect(paths.length).toBeGreaterThanOrEqual(4);
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
        expect(html).not.toContain('Should not render.');
        expect(html).not.toContain('id="s_hidden"');
        expect(files['faq.html']).toContain('Do I need to book?');
        expect(files['contact.html']).toContain('hi@x.in');
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
        expect(html).toContain('site-header');
        expect(html).toContain('href="#top"');
        expect(html).toContain('href="contact.html"');
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
        expect(html).toContain('href="contact.html"');
        expect(html).toContain('class="cta"');
        expect(files['contact.html']).toContain('<form class="form"');
        expect(files['contact.html']).toContain('mailto:hi@x.in');
        expect(files['contact.html']).toContain('type="email"');
        expect(files['contact.html']).toContain('<button type="submit">');
        expect(files['faq.html']).toContain('<details>');
        expect(files['services.html']).toContain('class="cards"');
        expect(files['services.html']).toContain('class="card"');
        expect(files['settings.html']).toContain('Settings');
        expect(files['settings.html']).toContain('data-working-form');
    });

    it('marks sections for the motion observer', () => {
        expect(html).toContain('data-animate');
        expect(html).toContain('IntersectionObserver');
    });

    it('links every content page from the header', () => {
        expect(html).toContain('aria-label="Site"');
        expect(html).toContain('href="services.html"');
        expect(html).toContain('href="faq.html"');
        expect(html).toContain('href="contact.html"');
        expect(html).toContain('href="settings.html"');
        expect(html).toContain('>Services<');
        expect(html).toContain('>FAQ<');
        expect(html).toContain('>Contact<');
        expect(html).toContain('>Settings<');
        expect(html).not.toContain('>Gallery<');
        expect(html).not.toContain('>Testimonials<');
        const lastNav = html.match(/<nav[^>]*aria-label="Site"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
        expect(lastNav.lastIndexOf('settings.html')).toBeGreaterThan(lastNav.lastIndexOf('contact.html'));
    });

    it('tags copy with data-slot so the content panel can edit it', () => {
        expect(html).toContain('data-slot="hero.heading"');
        expect(files['services.html']).toContain('data-slot="services.items.0.title"');
        expect(files['contact.html']).toContain('data-slot="contact.email"');
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
