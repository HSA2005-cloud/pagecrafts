import { describe, expect, it } from 'vitest';

import {
    crossVerticalFirewall,
    detectRequestedVerticalFamily,
    verticalFamily,
    wantsCrossSiteCreation,
} from '@/lib/editor/cross-vertical-firewall';

describe('cross-vertical firewall', () => {
    it('blocks restaurant → gym whole-site asks on an existing page', () => {
        const blocked = crossVerticalFirewall({
            instruction: 'Create a gym landing page',
            vertical: 'restaurant',
            sectionCount: 4,
        });
        expect(blocked).toMatch(/cannot turn it into/i);
        expect(blocked).toMatch(/gym/i);
    });

    it('blocks template forks that ask for a different business type', () => {
        const blocked = crossVerticalFirewall({
            instruction: 'Build me a dental clinic website instead',
            vertical: 'restaurant',
            sectionCount: 0,
            hasContentPage: true,
            contextText: 'Spice Route — evening restaurant in Bengaluru',
        });
        expect(blocked).toMatch(/cannot turn it into/i);
        expect(blocked).toMatch(/clinic/i);
    });

    it('allows copy and layout edits within the same business', () => {
        expect(
            crossVerticalFirewall({
                instruction: 'Make the headline shorter',
                vertical: 'restaurant',
                sectionCount: 3,
            }),
        ).toBeNull();
        expect(
            crossVerticalFirewall({
                instruction: 'Rename the shop to Meera Cafe',
                vertical: 'restaurant',
                sectionCount: 3,
            }),
        ).toBeNull();
    });

    it('allows refinements within the same vertical family', () => {
        expect(
            crossVerticalFirewall({
                instruction: 'Create a bakery website with a menu and contact form',
                vertical: 'restaurant',
                sectionCount: 3,
            }),
        ).toBeNull();
    });

    it('allows first-time generation on an empty project', () => {
        expect(
            crossVerticalFirewall({
                instruction: 'Create a gym website',
                vertical: null,
                sectionCount: 0,
                hasContentPage: false,
            }),
        ).toBeNull();
    });

    it('classifies vertical families from slugs and prompts', () => {
        expect(verticalFamily('restaurant')).toBe('food');
        expect(verticalFamily('yoga-studio')).toBe('fitness');
        expect(detectRequestedVerticalFamily('Create a gym website')).toBe('fitness');
        expect(detectRequestedVerticalFamily('portfolio for a photographer')).toBe('photography');
    });

    it('detects cross-site creation intent on built pages', () => {
        expect(wantsCrossSiteCreation('Create a restaurant website', { sectionCount: 2, hasContentPage: false })).toBe(true);
        expect(wantsCrossSiteCreation('Make the button teal', { sectionCount: 2, hasContentPage: false })).toBe(false);
        expect(wantsCrossSiteCreation('Turn this into a gym site', { sectionCount: 0, hasContentPage: true })).toBe(true);
    });
});
