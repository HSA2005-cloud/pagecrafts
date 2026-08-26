import { describe, expect, it } from 'vitest';

import { buildStyleOptions } from '@/lib/ai/generate/options';
import { MAX_BODY_BYTES, MAX_SITE_BODY_BYTES } from '@/lib/kernel/body';
import { MAX_TEXT_BYTES } from '@/lib/data/validate-file-map';
import { SCHEMA_VERSION, type Composition, type SectionInstance } from '@/lib/contracts';

// A generated site could not be saved. PUT /projects/{id}/files answered 413 and publishing
// failed after it, because withRoute applied the ordinary 64 KB form guard to a body that is
// a whole website — nine pages, each carrying its own inline stylesheet, 120 KB at the
// plainest and 350 KB animated.
//
// The limit that actually governs a site is MAX_TEXT_BYTES in validate-file-map, and it is
// the one that should decide: it knows it is measuring a site and says so when it refuses.

const section = (type: SectionInstance['type'], props: Record<string, unknown>): SectionInstance => ({
    id: `s_${type}`, type, variant: 'centred', brief: 'test',
    visible: true, locked: false, source: 'ai', props,
});

// Deliberately a heavy site: every section type, long copy, the lot.
const composition: Composition = {
    schemaVersion: SCHEMA_VERSION,
    vertical: 'restaurant',
    artDirection: {
        themeId: 'calm-sage', motionId: 'whisper', radiusId: 'soft',
        spacingId: 'airy', imageryId: 'warm-natural',
    },
    meta: { title: 'Savour & Stir', description: 'Fine dining in Bengaluru', lang: 'en' },
    sections: [
        section('hero', { heading: 'Savour & Stir', sub: 'Fine dining', ctaLabel: 'Reserve', image: { query: 'q', alt: 'A' } }),
        section('about', { heading: 'About', body: 'x'.repeat(300) }),
        section('services', { heading: 'What we do', items: [1, 2, 3, 4].map((i) => ({ title: `Service ${i}`, body: 'y'.repeat(150) })) }),
        section('menu', { heading: 'Menu', items: [1, 2, 3, 4, 5, 6].map((i) => ({ name: `Dish ${i}`, description: 'z'.repeat(80), price: '200' })) }),
        section('gallery', { heading: 'The room', images: [1, 2, 3, 4].map((i) => ({ query: `g${i}`, alt: `Photo ${i}` })) }),
        section('testimonials', { heading: 'Praise', items: [1, 2].map((i) => ({ quote: 'w'.repeat(120), author: `A${i}` })) }),
        section('faq', { heading: 'FAQ', items: [1, 2, 3].map((i) => ({ question: `Q${i}`, answer: 'a'.repeat(120) })) }),
        section('contact', { heading: 'Find us', blurb: 'Indiranagar' }),
        section('footer', { tagline: 'Savour & Stir' }),
    ],
};

const build = () => buildStyleOptions(composition, undefined, undefined, 'job_wire');
const wireBytes = (files: Record<string, string>) =>
    Buffer.byteLength(JSON.stringify({ files }), 'utf8');

describe('a generated site fits through the route that saves it', () => {
    it('gives the save route room for a whole site', () => {
        expect(MAX_SITE_BODY_BYTES).toBeGreaterThan(MAX_TEXT_BYTES);
        expect(MAX_SITE_BODY_BYTES).toBeGreaterThan(MAX_BODY_BYTES);
    });

    it('leaves every other route on the ordinary guard', () => {
        // Raising this globally would drop the form-sized default everything else relies on.
        expect(MAX_BODY_BYTES).toBe(64 * 1024);
    });

    it('sends every look under the cap', async () => {
        for (const option of await build()) {
            const bytes = wireBytes(option.files);

            expect(bytes, `${option.id} is ${bytes} bytes`).toBeLessThanOrEqual(MAX_SITE_BODY_BYTES);
        }
    });

    it('would have been rejected by the old guard, which is the bug', async () => {
        for (const option of await build()) {
            expect(wireBytes(option.files), option.id).toBeGreaterThan(MAX_BODY_BYTES);
        }
    });
});

// Each page carries its own stylesheet, so every byte costs once per page. Tab CSS and its
// script are 3 KB and only the page holding the tabbed section can use them; shipping them
// to all nine put 25 KB on the wire for nothing.
describe('a page carries only the assets its markup uses', () => {
    it('never ships tab styling to a page with no tabs', async () => {
        for (const option of await build()) {
            for (const [path, html] of Object.entries(option.files)) {
                if (html.includes('[data-tabs] .tablist')) {
                    expect(html, `${option.id}/${path} has tab css but no tabs`).toContain('data-tabs');
                }
            }
        }
    });

    it('always ships tab styling to a page that has them', async () => {
        for (const option of await build()) {
            for (const [path, html] of Object.entries(option.files)) {
                if (html.includes('data-tabs')) {
                    expect(html, `${option.id}/${path} has tabs but no css`).toContain('[data-tabs] .tablist');
                    expect(html, `${option.id}/${path} has tabs but no script`).toContain('role="tab"');
                }
            }
        }
    });

    it('keeps every page standing on its own', async () => {
        for (const option of await build()) {
            for (const [path, html] of Object.entries(option.files)) {
                expect(html, `${option.id}/${path}`).not.toMatch(/<script[^>]+src=/i);
                expect(html, `${option.id}/${path}`).not.toMatch(/<link[^>]+rel=["']?stylesheet/i);
            }
        }
    });
});
