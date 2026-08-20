import { describe, expect, it } from 'vitest';
import { injectErrorHook } from '@/lib/preview';
import { PREVIEW_IFRAME_SANDBOX, withPreviewCsp } from '@/lib/preview-security';
import { matchPreviewSection, PREVIEW_BOOTSTRAP_JS, type PreviewSectionHint } from '@/lib/preview-runtime';
import { TEMPLATES } from '@/lib/templates';
import { readFileSync } from 'node:fs';

function hintsFrom(html: string): PreviewSectionHint[] {
    const sections: PreviewSectionHint[] = [];
    const re = /<section\b([^>]*)>([\s\S]*?)<\/section>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
        const attrs = match[1] ?? '';
        const body = match[2] ?? '';
        const id = attrs.match(/\bid="([^"]+)"/i)?.[1] ?? '';
        const type = attrs.match(/\bdata-type="([^"]+)"/i)?.[1]
            ?? attrs.match(/\bdata-section="([^"]+)"/i)?.[1];
        const heading = body.match(/<h[1-6][^>]*>([^<]+)/i)?.[1] ?? '';
        const slotPrefix = body.match(/data-slot="([^.]+)\./i)?.[1];
        if (id) sections.push({ id, heading, slotPrefix, type });
    }
    return sections;
}

describe('PREVIEW_IFRAME_SANDBOX', () => {
    it('lets scripts and forms run without granting the editor origin', () => {
        expect(PREVIEW_IFRAME_SANDBOX.split(/\s+/).sort()).toEqual(
            ['allow-forms', 'allow-scripts'].sort(),
        );
        expect(PREVIEW_IFRAME_SANDBOX).not.toContain('allow-same-origin');
    });
});

describe('matchPreviewSection', () => {
    it('hits an exact id, which is how generated sites and CTAs are wired', () => {
        const sections = [
            { id: 's1', heading: 'Hello', type: 'hero' },
            { id: 's2', heading: 'Services', type: 'services' },
        ];
        expect(matchPreviewSection(sections, '#s2', 'Services')).toBe('s2');
        expect(matchPreviewSection(sections, 's1', 'Home')).toBe('s1');
    });

    it('maps a nav label to the matching content slot when ids differ', () => {
        const portfolio = [
            { id: 'selected-work', heading: 'Selected work', slotPrefix: 'work' },
            { id: 'lets-talk', heading: "Let's talk", slotPrefix: 'contact' },
        ];
        expect(matchPreviewSection(portfolio, '#work', 'Work')).toBe('selected-work');
        expect(matchPreviewSection(portfolio, 'contact', 'Contact')).toBe('lets-talk');
        expect(matchPreviewSection(portfolio, 'selected-work', 'View work')).toBe('selected-work');
        expect(matchPreviewSection(portfolio, 'about', 'About')).toBeNull();
    });

    it('resolves real blueprint templates, not just the portfolio sample', () => {
        expect(TEMPLATES.length).toBeGreaterThan(3);
        for (const template of TEMPLATES) {
            const html = template.files['index.html'] ?? '';
            const sections = hintsFrom(html);
            expect(sections.length, template.id).toBeGreaterThan(0);

            const cta = html.match(/class="cta"[^>]*href="(#[^"]+)"/i)?.[1];
            if (cta) {
                expect(
                    matchPreviewSection(sections, cta, 'View'),
                    `${template.id} cta ${cta}`,
                ).toBeTruthy();
            }

            const nav = html.match(/<nav[\s\S]*?<\/nav>/i)?.[0] ?? '';
            for (const href of nav.match(/href="(#[^"]+)"/gi) ?? []) {
                const hash = href.match(/href="(#[^"]+)"/i)?.[1] ?? '';
                const label = html.split(href)[1]?.match(/>([^<]+)</)?.[1]?.trim() ?? '';
                const id = hash.replace('#', '');
                if (!sections.some((section) => section.slotPrefix === id)) continue;
                expect(
                    matchPreviewSection(sections, hash, label),
                    `${template.id} ${label} ${hash}`,
                ).toBeTruthy();
            }
        }
    });
});

describe('preview bootstrap', () => {
    it('is injected into every preview document', () => {
        const html = injectErrorHook('<html><head><title>x</title></head><body>$&</body></html>');
        expect(html).toContain('scrollIntoView');
        expect(html).toContain("href.charAt(0) === '#'");
        expect(html.indexOf('<script>')).toBeGreaterThan(html.toLowerCase().indexOf('<head'));
        expect(html).toContain('<title>x</title>');
        expect(html).toContain('<body>$&</body>');
    });

    it('intercepts hash clicks, form submits, and decorative search controls', () => {
        expect(PREVIEW_BOOTSTRAP_JS).toContain('scrollIntoView');
        expect(PREVIEW_BOOTSTRAP_JS).toContain("href.charAt(0) === '#'");
        expect(PREVIEW_BOOTSTRAP_JS).toContain("addEventListener('submit'");
        expect(PREVIEW_BOOTSTRAP_JS).toContain("addEventListener('click'");
        expect(PREVIEW_BOOTSTRAP_JS).toContain('pagecraft-preview-find');
        expect(PREVIEW_BOOTSTRAP_JS).toContain('HTMLFormElement.prototype.submit');
        expect(PREVIEW_BOOTSTRAP_JS).toContain('kind: \'navigate\'');
        expect(PREVIEW_BOOTSTRAP_JS).toContain('Thanks — we got your message.');
        expect(PREVIEW_BOOTSTRAP_JS).toContain('.form-status');
    });

    it('keeps outbound form posts blocked even after allow-forms is granted', () => {
        const csp = withPreviewCsp('<html><head></head><body></body></html>');
        expect(csp).toContain("form-action 'none'");
        expect(csp).toContain("connect-src 'none'");
    });
});

describe('PreviewPane sandbox', () => {
    it('uses the shared unique-origin sandbox on both viewports', () => {
        const source = readFileSync('src/components/editor/PreviewPane.tsx', 'utf8');
        expect(source).toContain('PREVIEW_IFRAME_SANDBOX');
        expect(source).toContain('pointer-events-auto');
        expect(source).not.toMatch(/sandbox="allow-scripts"/);
        expect(source).not.toContain('allow-same-origin');
        expect(source).toContain("viewport === 'phone'");
        expect(source).toContain("viewport === 'full'");
        expect(source).toContain("kind === 'navigate'");
        expect(source).toContain('htmlPagesOf');
    });
});
