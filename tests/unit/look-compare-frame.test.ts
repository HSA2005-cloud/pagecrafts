import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The compare cards shrink a real page to fit. That only works if the iframe's size and the
// scale agree: a viewport of 200% at scale 0.5 lands on exactly 100% in both directions.
//
// It was 180% wide and 220% tall at 0.56 — 101% across but 123% down — so a quarter of every
// preview fell off the bottom of the card. That is what clipped the Animated headline, and
// on a card too short to hold a 28rem image-bg hero, Photo-rich showed the top edge of a
// dark photograph and read as blank.

const SOURCE = readFileSync(
    join(process.cwd(), 'src/components/marketing/LookCompareDemo.tsx'),
    'utf8',
);
const CSS = readFileSync(join(process.cwd(), 'src/lib/ai/generate/to-files.ts'), 'utf8');

/** Tailwind's h-N / w-N are in quarter-rems; 1rem is 16px. */
const REM = 16;
const spacing = (n: number) => (n / 4) * REM;

function frame() {
    const card = SOURCE.match(/relative h-(\d+) overflow-hidden bg-muted/);
    const width = SOURCE.match(/w-\[(\d+)%\]/);
    const height = SOURCE.match(/h-\[(\d+)%\]/);
    const scale = SOURCE.match(/scale-(\d+)\b/);

    return {
        cardPx: spacing(Number(card?.[1])),
        widthPct: Number(width?.[1]),
        heightPct: Number(height?.[1]),
        scale: Number(scale?.[1]) / 100,
    };
}

describe('the compare card shows a whole hero, not the top quarter of one', () => {
    it('found the frame it is checking', () => {
        const f = frame();

        expect(f.cardPx).toBeGreaterThan(0);
        expect(f.widthPct).toBeGreaterThan(0);
        expect(f.heightPct).toBeGreaterThan(0);
        expect(f.scale).toBeGreaterThan(0);
    });

    // The whole failure was these two disagreeing.
    it('scales the iframe to exactly the card, in both directions', () => {
        const f = frame();

        expect(f.widthPct * f.scale).toBe(100);
        expect(f.heightPct * f.scale).toBe(100);
    });

    it('gives the viewport enough height for an image-bg hero', () => {
        const f = frame();
        const viewport = f.cardPx * (f.heightPct / 100);
        const [, rem] = CSS.match(/\[data-variant="image-bg"\][^}]*min-height:\s*(\d+)rem/) ?? [];

        expect(Number(rem), 'image-bg hero has no min-height to check against').toBeGreaterThan(0);
        expect(viewport).toBeGreaterThanOrEqual(Number(rem) * REM);
    });

    it('gives the viewport enough height for the motion hero', () => {
        const f = frame();
        const viewport = f.cardPx * (f.heightPct / 100);
        const [, vh] = CSS.match(/\[data-style="motion"\] \[data-type="hero"\] \{[^}]*min-height:\s*(\d+)vh/) ?? [];

        expect(Number(vh), 'motion hero has no min-height to check against').toBeGreaterThan(0);
        expect(viewport * (Number(vh) / 100)).toBeLessThanOrEqual(viewport);
    });
});
