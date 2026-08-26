import { describe, expect, it } from 'vitest';
import { htmlPagesOf, planSitePages } from '@/lib/ai/generate/pages';
import { compositionToFiles } from '@/lib/ai/generate/to-files';
import { SCHEMA_VERSION, type ArtDirection, type Composition, type SectionInstance } from '@/lib/contracts';

const ART: ArtDirection = {
    themeId: 'calm-sage', motionId: 'whisper', radiusId: 'soft',
    spacingId: 'airy', imageryId: 'warm-natural',
};

const section = (
    id: string,
    type: SectionInstance['type'],
    props: Record<string, unknown> = {},
): SectionInstance => ({
    id, type, variant: 'simple', brief: 'b', visible: true, locked: false, source: 'ai', props,
});

const thin: Composition = {
    schemaVersion: SCHEMA_VERSION,
    vertical: 'cafe',
    artDirection: ART,
    meta: { title: 'Kettle', description: 'Tea in Pune', lang: 'en' },
    sections: [
        section('s_01', 'hero', { heading: 'Kettle', ctaLabel: 'Visit' }),
        section('s_02', 'footer', { tagline: 'Kettle' }),
    ],
};

describe('planSitePages', () => {
    it('fills About and Contact and puts Settings last when the plan is thin', () => {
        const pages = planSitePages(thin);
        expect(pages.map((p) => p.path)).toEqual([
            'index.html',
            'about.html',
            'contact.html',
            'settings.html',
        ]);
    });
});

describe('htmlPagesOf', () => {
    it('sorts home first and Settings last', () => {
        expect(htmlPagesOf({
            'settings.html': '',
            'about.html': '',
            'index.html': '',
            'composition.json': '{}',
        })).toEqual(['index.html', 'about.html', 'settings.html']);
    });
});

describe('thin compositions still ship a working site', () => {
    it('synthesises About, Contact, and Settings with a working form', () => {
        const files = compositionToFiles(thin);
        expect(files['about.html']).toContain('About Kettle');
        expect(files['contact.html']).toContain('Get in touch');
        expect(files['contact.html']).toContain('data-working-form');
        expect(files['contact.html']).not.toContain('hello@example.com');
        expect(files['contact.html']).toContain('Prefer to message first');
        expect(files['contact.html']).toContain('Hours by appointment');
        expect(files['settings.html']).toContain('Tea in Pune');
        expect(files['settings.html']).toContain('data-working-form');
        expect(files['index.html']).toContain('href="contact.html"');
    });

    it('keeps contact finished when optional facts are empty (all looks)', () => {
        const emptyFacts: Composition = {
            ...thin,
            sections: [
                section('s_01', 'hero', { heading: 'Kettle', ctaLabel: 'Visit' }),
                section('s_02', 'about', { heading: 'Our story' }),
                section('s_03', 'contact', { heading: '', blurb: '', phone: '', email: '', address: '', hours: '' }),
                section('s_04', 'footer', { tagline: '' }),
            ],
        };
        for (const style of ['casual', 'photos', 'motion'] as const) {
            const files = compositionToFiles(emptyFacts, style);
            const html = Object.values(files).join('\n');
            expect(html, style).toContain('Get in touch');
            expect(html, style).toContain('Send Kettle a message');
            expect(html, style).toContain('Prefer to message first');
            expect(html, style).toContain('Hours by appointment');
            expect(html, style).toContain('Send message');
            expect(html, style).toContain('data-working-form');
            expect(html, style).not.toContain('hello@example.com');
            expect(html, style).toContain('Kettle'); // footer fallback
            expect(html, style).toMatch(/About Kettle|Our story/);
        }
    });

    it('puts about and services on the home page when they exist', () => {
        const full: Composition = {
            ...thin,
            sections: [
                section('s_01', 'hero', { heading: 'Kettle', ctaLabel: 'Visit' }),
                section('s_02', 'about', { heading: 'Our story', body: 'Tea since dawn.' }),
                section('s_03', 'services', {
                    heading: 'What we pour',
                    items: [{ title: 'Assam', description: 'Strong cup' }],
                }),
                section('s_04', 'contact', { heading: 'Visit' }),
                section('s_05', 'footer', { tagline: 'Kettle' }),
            ],
        };
        const pages = planSitePages(full);
        const home = pages.find((p) => p.path === 'index.html');
        expect(home?.sections.map((s) => s.type)).toEqual(['hero', 'about', 'services']);
        expect(pages.map((p) => p.path)).toEqual([
            'index.html',
            'about.html',
            'services.html',
            'contact.html',
            'settings.html',
        ]);
    });

    it('plans a continuous Premium deck with hash nav', () => {
        const full: Composition = {
            ...thin,
            sections: [
                section('s_01', 'hero', { heading: 'Kettle' }),
                section('s_02', 'about', { heading: 'Our story', body: 'Tea.' }),
                section('s_03', 'services', { heading: 'Pour' }),
                section('s_04', 'contact', { heading: 'Visit' }),
                section('s_05', 'footer', { tagline: 'Kettle' }),
            ],
        };
        const pages = planSitePages(full, { continuous: true });
        const files = pages.filter((p) => !p.navOnly);
        expect(files.map((p) => p.path)).toEqual(['index.html', 'settings.html']);
        expect(pages.some((p) => p.href === '#about')).toBe(true);
        expect(pages.find((p) => p.path === 'index.html' && !p.navOnly)?.sections.map((s) => s.type))
            .toEqual(['hero', 'about', 'services', 'contact']);
    });
});
