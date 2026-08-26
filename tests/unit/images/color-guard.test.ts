import { describe, expect, it } from 'vitest';

import { channelsLookGrayscale } from '@/lib/images/color-guard';
import { IMAGERY } from '@/lib/render/art-direction';

describe('channelsLookGrayscale', () => {
    it('flags near-identical RGB channels as black-and-white', () => {
        expect(channelsLookGrayscale([
            { mean: 80 }, { mean: 81 }, { mean: 79 },
        ])).toBe(true);
    });

    it('lets a colourful photograph through', () => {
        expect(channelsLookGrayscale([
            { mean: 140 }, { mean: 90 }, { mean: 60 },
        ])).toBe(false);
    });

    it('treats fewer than three channels as grayscale', () => {
        expect(channelsLookGrayscale([{ mean: 50 }, { mean: 50 }])).toBe(true);
    });
});

describe('imagery dials never wash photos to mono', () => {
    it('contains no grayscale() filter', () => {
        for (const [id, treatment] of Object.entries(IMAGERY)) {
            expect(treatment.filter, id).not.toMatch(/grayscale/i);
        }
    });

    it('keeps saturation at or above full colour', () => {
        for (const [id, treatment] of Object.entries(IMAGERY)) {
            const match = treatment.filter.match(/saturate\(([\d.]+)\)/);
            expect(match, `${id} should set saturate()`).toBeTruthy();
            expect(Number(match![1]), id).toBeGreaterThanOrEqual(1);
        }
    });
});
