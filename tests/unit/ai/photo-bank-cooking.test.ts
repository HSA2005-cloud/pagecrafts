import { describe, expect, it } from 'vitest';

import { bankPhotoUrl, photoSearchQuery } from '@/lib/ai/generate/photos';

// A cookery school in Bengaluru was handed a photograph of skyscrapers.
//
// "cooking school" matched none of the keyword pools, so it fell to the general bank, which
// carries architecture and office desks for briefs about nothing in particular. Live Unsplash
// hid the gap — Set 1 searched and found a real kitchen — until Set 2 excluded Set 1's hero
// and dropped through to the bank with nothing food-shaped to land on.
//
// Teaching people to cook is a food business. The keyword rule now says so.

const RESTAURANT = [
    'photo-1414235077428-338989a2e8c0',
    'photo-1517248135467-4c7edcad34c4',
    'photo-1504674900247-0877df9cc836',
    'photo-1559339352-11d035aa65de',
    'photo-1416879595882-3373a0480b5b',
    'photo-1565299624946-b28f40a0ae38',
    'photo-1466978913421-dad2ebd01d17',
    'photo-1546069901-ba9599a7e63c',
    'photo-1476224203421-9ac39bcb3327',
];

const ARCHITECTURE = 'photo-1486406146926-c627a92ad1ab';

const idOf = (url: string) => url.match(/photo-[0-9A-Za-z_-]+/)?.[0] ?? url;

const heroFor = (vertical: string, salt = 'set1', exclude = new Set<string>()) =>
    idOf(bankPhotoUrl(
        photoSearchQuery(vertical, 'Savour & Stir', 'hero', 'Beginner basics, advanced techniques'),
        salt,
        exclude,
    ));

describe('a cooking school is a food business', () => {
    it.each([
        'cooking school',
        'culinary school',
        'cooking classes',
        'cookery class',
        'chef academy',
        'culinary arts institute',
    ])('%s gets a kitchen, not a skyline', (vertical) => {
        expect(RESTAURANT).toContain(heroFor(vertical));
    });

    // The exact reported failure: Set 1 looked right, Set 2 did not.
    it('stays food on the second Set, which excludes the first hero', () => {
        const first = heroFor('cooking classes', 'set1');
        const second = heroFor('cooking classes', 'set2', new Set([first]));

        expect(second).not.toBe(first);
        expect(second).not.toBe(ARCHITECTURE);
        expect(RESTAURANT).toContain(second);
    });
});

describe('nothing else moved', () => {
    it('keeps restaurants on food and travel off it', () => {
        expect(RESTAURANT).toContain(heroFor('restaurant'));
        expect(RESTAURANT).not.toContain(idOf(bankPhotoUrl('travel vlog nature outdoors', 's')));
    });
});
