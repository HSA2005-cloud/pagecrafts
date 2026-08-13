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
        expect(html).toContain('id="s_01"');
        expect(html).toContain('data-type="hero"');
        expect(html).toContain('Family dentistry');
        expect(html).toContain('Do I need to book?');
        expect(html).toContain('hi@x.in');
        expect(html).not.toContain('Should not render.');
        expect(html).not.toContain('id="s_hidden"');
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

    it('marks sections for the motion observer', () => {
        expect(html).toContain('data-animate');
        expect(html).toContain('IntersectionObserver');
    });
});
