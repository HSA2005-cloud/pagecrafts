import { describe, expect, it } from 'vitest';
import { filesForPreview } from '@/lib/editor/preview-files';
import type { Composition } from '@/lib/contracts';

const composition: Composition = {
    schemaVersion: 3,
    vertical: 'sweet-shop',
    artDirection: {
        themeId: 'sunlit-craft',
        motionId: 'calm',
        radiusId: 'soft',
        spacingId: 'default',
        imageryId: 'warm-natural',
    },
    meta: { title: 'Sugar & Co', description: 'Sweets', lang: 'en' },
    sections: [
        {
            id: 'hero', type: 'hero', variant: 'centred', brief: '',
            visible: true, locked: false, source: 'ai',
            props: { heading: 'Handmade sweets', sub: 'Daily trays' },
        },
    ],
};

describe('filesForPreview', () => {
    it('leaves the tree alone when nothing is pending', () => {
        const files = { 'index.html': '<h1>Old</h1>' };
        expect(filesForPreview(files, null)).toEqual(files);
    });

    it('rebuilds Your site from a pending composition', () => {
        const files = { 'index.html': '<h1>Old</h1>' };
        const overlay = filesForPreview(files, {
            path: 'composition.json',
            after: JSON.stringify(composition),
        });

        expect(overlay['index.html']).toContain('Handmade sweets');
        expect(overlay['index.html']).toContain('site-header');
        expect(overlay['index.html']).toContain('href="#top"');
        expect(overlay['composition.json']).toContain('Sugar & Co');
        expect(files['index.html']).toBe('<h1>Old</h1>');
    });
});
