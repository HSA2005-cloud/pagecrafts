import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The Animated look is the Rs 999 tier, and it kept coming out worth less than the free one.
//
// This file was much longer. It asserted a motif palette, an aurora and a ticker that the
// motion rewrite on main removed, so those assertions were testing deleted code and have
// gone with it. What is left is the part that survived the rewrite because it was never
// really a styling opinion: the premium tier has to show the photograph, and a business
// name must not be cut in half.

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const CSS = read('src/lib/ai/generate/to-files.ts');
const STYLES = read('src/lib/ai/generate/styles.ts');
const RUNNER = read('src/lib/ai/jobs/runner.ts');

function rule(selector: string): string {
    const start = CSS.indexOf(selector);
    if (start === -1) return '';
    return CSS.slice(start, CSS.indexOf('}', start));
}

describe('the premium tier is given a photograph', () => {
    // photos: false meant stampPhotoUrls skipped the Animated look entirely, so its hero
    // image slot was empty markup. Revealing it in CSS achieves nothing without this.
    it('asks for the hero photo rather than opting out', () => {
        const motion = STYLES.slice(STYLES.indexOf('motion: {'));
        const [, value] = motion.match(/photos:\s*([^,\n]+)/) ?? [];

        expect(value?.trim()).toBe("'hero'");
    });

    // Twice now the motion stylesheet has shipped with the hero photo hidden, so the tier
    // being sold as premium showed less than the free one.
    it('does not hide the photo the free tier keeps', () => {
        const slot = rule('[data-style="motion"] [data-type="hero"] .img-slot {');

        expect(slot).not.toMatch(/display:\s*none/);
        expect(slot).toContain('display: block');
    });

    it('lays it full bleed behind the words rather than in a box', () => {
        const slot = rule('[data-style="motion"] [data-type="hero"] .img-slot {');

        expect(slot).toContain('position: absolute');
        expect(slot).toContain('inset: 0');
        expect(slot).toContain('border-radius: 0');
        expect(rule('[data-style="motion"] [data-type="hero"] .img-slot img {'))
            .toContain('object-fit: cover');
        expect(rule('[data-style="motion"] [data-type="hero"] {')).toContain('min-height: 100vh');
        expect(rule('[data-style="motion"] [data-type="hero"] {')).toContain('border-radius: 0');
        expect(rule('[data-style="motion"] [data-type="hero"] {')).toContain('padding: 0');
    });

    it('darkens it under the type, or the headline cannot be read', () => {
        expect(rule('[data-style="motion"] [data-type="hero"]::after {')).toContain('linear-gradient');
    });

    it('moves slowly, and holds still for anyone who asked it to', () => {
        expect(CSS).toContain('@keyframes pc-kenburns');

        const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
        expect(reduced).toContain('[data-style="motion"] [data-type="hero"] .img-slot');
    });
});

describe('the animated headline', () => {
    const hero = rule('[data-style="motion"] [data-type="hero"] h1 {');

    // '1522 Hotel' came back as '152 / 2 / Hot / el' once, and '1947 Restaurant - Pure Veg
    // Restaurant' was cut mid-word before that. Both were the same fault: a cap with nothing
    // telling the text how to wrap inside it.
    it('is told how to wrap, so a long trading name cannot overflow', () => {
        expect(hero).toContain('overflow-wrap: break-word');
        expect(hero).toContain('text-wrap: balance');
    });

    it('starts small enough on a phone to have somewhere to wrap to', () => {
        const [, min] = hero.match(/font-size:\s*clamp\(([^,]+),/) ?? [];

        expect(min?.trim()).toBe('2.4rem');
    });

    it('uses a distinctive Bodoni display face, not Impact-weight sans', () => {
        expect(hero).toContain('font-family: var(--display-font)');
        expect(CSS).toContain('"Bodoni Moda"');
        expect(CSS).not.toMatch(/\[data-style="motion"\] \[data-type="hero"\] h1 \{[^}]*font-weight:\s*800/);
    });
});

describe('two people, or two attempts, do not get the same picture', () => {
    // A page of Unsplash results came back and items[0] was read every time. The query is
    // built from vertical and title, so every restaurant in the country got one identical
    // photograph and generating again returned it a second time.
    it('reads across the results page instead of always taking the first', () => {
        expect(RUNNER).not.toMatch(/return items\[0\]\?\.fullUrl/);
        expect(RUNNER).toContain('pickIndex(');
    });

    it('varies by job, so generating again is not a duplicate', () => {
        expect(RUNNER).toContain('lookupPhoto(q, job.id');
        // Bank / offline fallback must take the same salt — keyword restaurant used to
        // ignore it and stamp the same dining table on every Set.
        expect(RUNNER).toContain('bankPhotoUrl(query, salt');
        // Set 2 must skip heroes already shown on earlier Sets — salt alone collides.
        expect(RUNNER).toContain('usedHeroPhotoKeys');
        expect(RUNNER).toContain('usedHeroes');
    });
});
