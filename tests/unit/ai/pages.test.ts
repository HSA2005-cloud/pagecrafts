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
    it('synthesises About, Contact, and Settings with a mailto form', () => {
        const files = compositionToFiles(thin);
        expect(files['about.html']).toContain('About Kettle');
        expect(files['contact.html']).toContain('mailto:');
        expect(files['contact.html']).toContain('data-working-form');
        expect(files['settings.html']).toContain('Tea in Pune');
        expect(files['settings.html']).toContain('data-working-form');
        expect(files['index.html']).toContain('href="contact.html"');
    });
});
