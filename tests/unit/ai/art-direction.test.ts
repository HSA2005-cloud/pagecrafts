import { describe, it, expect } from 'vitest';
import {
    THEMES, RADII, SPACING, IMAGERY, artDirectionCss, describeArtDirection,
} from '@/lib/render/art-direction';
import { compositionShell } from '@/lib/render/page-shell';
import {
    THEME_IDS, RADIUS_IDS, SPACING_IDS, IMAGERY_IDS, MOTION_IDS,
    type ArtDirection,
} from '@/lib/contracts';

const art = (over: Partial<ArtDirection> = {}): ArtDirection => ({
    themeId: 'clinical-blue', motionId: 'calm', radiusId: 'soft',
    spacingId: 'default', imageryId: 'bright-clean', ...over,
});

describe('art direction — every dial has a definition', () => {
    it('defines all eight themes (3 → 8, per the v2.0 amendment)', () => {
        expect(Object.keys(THEMES).sort()).toEqual([...THEME_IDS].sort());
        expect(THEME_IDS.length).toBe(8);
    });

    it('defines every corner style, spacing step and photographic treatment', () => {
        expect(Object.keys(RADII).sort()).toEqual([...RADIUS_IDS].sort());
        expect(Object.keys(SPACING).sort()).toEqual([...SPACING_IDS].sort());
        expect(Object.keys(IMAGERY).sort()).toEqual([...IMAGERY_IDS].sort());
    });

    it('never turns photographs black-and-white', () => {
        for (const [id, treatment] of Object.entries(IMAGERY)) {
            expect(treatment.filter, id).not.toMatch(/grayscale/i);
            expect(treatment.filter, id).not.toMatch(/gray\s*\(/i);
        }
    });

    it('gives every theme a complete palette', () => {
        for (const [id, theme] of Object.entries(THEMES)) {
            for (const key of ['bg', 'ink', 'muted', 'accent', 'accentInk', 'panel', 'rule']) {
                expect(theme[key as keyof typeof theme], `${id}.${key}`)
                    .toMatch(/^#[0-9a-f]{6}$/i);
            }
            expect(theme.displayFont.length, id).toBeGreaterThan(0);
        }
    });
});

describe('art direction — the dials actually reach the CSS', () => {
    /**
     * The D14 gap this closes: all five were chosen by the profile stage and
     * rendered by nothing. A dial that does not appear in the output is a dial
     * that does not exist.
     */
    it('emits a custom property for every dial', () => {
        const css = artDirectionCss(art({
            themeId: 'deep-luxury', radiusId: 'pill', spacingId: 'airy', imageryId: 'documentary',
        }));

        expect(css).toContain(THEMES['deep-luxury'].accent);
        expect(css).toContain(`--radius-md: ${RADII.pill.md}`);
        expect(css).toContain(`--section-gap: ${SPACING.airy.section}`);
        expect(css).toContain(`--image-filter: ${IMAGERY.documentary.filter}`);
    });

    it('produces different CSS for different verticals — not one look for everyone', () => {
        const clinic = artDirectionCss(art({ themeId: 'calm-sage', spacingId: 'airy' }));
        const gym = artDirectionCss(art({
            themeId: 'vivid-energy', radiusId: 'sharp', spacingId: 'tight',
            imageryId: 'bold-contrast',
        }));

        expect(clinic).not.toBe(gym);
        expect(clinic).toContain(THEMES['calm-sage'].accent);
        expect(gym).toContain(THEMES['vivid-energy'].accent);
    });

    it('renders valid-looking CSS for every combination the schema permits', () => {
        for (const themeId of THEME_IDS) {
            for (const radiusId of RADIUS_IDS) {
                for (const spacingId of SPACING_IDS) {
                    for (const imageryId of IMAGERY_IDS) {
                        const css = artDirectionCss(
                            art({ themeId, radiusId, spacingId, imageryId }),
                        );
                        const where = `${themeId}/${radiusId}/${spacingId}/${imageryId}`;
                        // Balanced braces and no unresolved lookups.
                        expect(css.split('{').length, where).toBe(css.split('}').length);
                        expect(css, where).not.toContain('undefined');
                    }
                }
            }
        }
    });

    it('uses the same variable names hand-authored templates already emit', () => {
        // A section component should not care whether a template or a
        // composition produced the page it is rendering into.
        const css = artDirectionCss(art());
        for (const name of ['--bg', '--ink', '--muted', '--accent', '--panel', '--rule']) {
            expect(css).toContain(`${name}:`);
        }
    });
});

describe('composition shell', () => {
    it('carries the motion dial onto the body and the theme into the style block', () => {
        const html = compositionShell({
            title: 'Smile Dental',
            description: 'Family dentistry in Koramangala',
            lang: 'en',
            artDirection: art({ themeId: 'calm-sage', motionId: 'whisper' }),
            body: '<main><h1>Smile Dental</h1></main>',
        });

        expect(html).toContain('data-motion="whisper"');
        expect(html).toContain(THEMES['calm-sage'].accent);
        expect(html).toContain('<h1>Smile Dental</h1>');
        expect(html).toMatch(/^<!doctype html>/);
    });

    it('ships the motion stylesheet and the observer with the page', () => {
        const html = compositionShell({
            title: 'T', description: 'D', lang: 'en',
            artDirection: art(), body: '<main></main>',
        });

        expect(html).toContain('[data-motion="none"]');
        expect(html).toContain('prefers-reduced-motion');
        expect(html).toContain('IntersectionObserver');
    });

    it('works for every motion id', () => {
        for (const motionId of MOTION_IDS) {
            const html = compositionShell({
                title: 'T', description: 'D', lang: 'en',
                artDirection: art({ motionId }), body: '',
            });
            expect(html, motionId).toContain(`data-motion="${motionId}"`);
        }
    });
});

describe('describeArtDirection', () => {
    it('reads as a sentence for the eval report', () => {
        expect(describeArtDirection(art({
            themeId: 'mono-precision', motionId: 'none', radiusId: 'sharp',
            spacingId: 'tight', imageryId: 'documentary',
        }))).toBe('Mono precision · none motion · sharp corners · tight spacing · documentary');
    });
});
