import { describe, it, expect } from 'vitest';
import { publicVariant } from '@/lib/ai/jobs/attempts';
import type { StyleOption } from '@/lib/ai/generate/options';

// The picker sent index.html on its own. A custom build keeps its CSS in styles.css and
// links to it by relative path, and a preview card has no server to resolve that against --
// so all three looks came back as raw HTML, and identical to each other, because the
// stylesheet was the only thing that differed between them.

function option(files: Record<string, string>): StyleOption {
    return {
        id: 'casual',
        label: 'Casual',
        blurb: 'Simple.',
        tier: 'free',
        priceInr: 0,
        composition: {} as StyleOption['composition'],
        files,
    };
}

const CSS = 'body { font-family: Inter; }';

describe('the look the picker renders', () => {
    it('carries the stylesheet inside the page', () => {
        const { html } = publicVariant(option({
            'index.html': '<html><head><link rel="stylesheet" href="styles.css"/></head><body><h1>Savor</h1></body></html>',
            'styles.css': CSS,
        }));

        expect(html).toContain(CSS);
        expect(html).toContain('<h1>Savor</h1>');
    });

    // Left in, it is a request for a file the card cannot fetch — harmless but pointless,
    // and on a real origin it would be a 404 in everyone's console.
    it('drops the link it replaced', () => {
        const { html } = publicVariant(option({
            'index.html': '<html><head><link rel="stylesheet" href="./styles.css"></head><body></body></html>',
            'styles.css': CSS,
        }));

        expect(html).not.toMatch(/<link[^>]*styles\.css/i);
    });

    it('still styles a fragment that has no head of its own', () => {
        const { html } = publicVariant(option({
            'index.html': '<section><h1>Savor</h1></section>',
            'styles.css': CSS,
        }));

        expect(html).toContain(CSS);
        expect(html.indexOf(CSS)).toBeLessThan(html.indexOf('<h1>Savor</h1>'));
    });

    // The recipe path writes its CSS into a <style> tag already. Nothing to do there.
    it('leaves a page that already carries its own styles alone', () => {
        const page = '<html><head><style>h1{color:red}</style></head><body></body></html>';
        const { html } = publicVariant(option({ 'index.html': page }));

        expect(html).toBe(page);
    });

    it('does not invent a page when there is none', () => {
        expect(publicVariant(option({ 'styles.css': CSS })).html).toBe('');
    });
});
