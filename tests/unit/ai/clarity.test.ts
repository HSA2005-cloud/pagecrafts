import { describe, expect, it } from 'vitest';

import {
    briefClarityErrors,
    nameLooksClear,
    offerLooksClear,
    placeLooksClear,
    promptLooksClear,
    textLooksGibberish,
    UNCLEAR_BRIEF_MESSAGE,
} from '@/lib/ai/generate/clarity';
import { briefErrors, emptyBrief, type SiteBrief } from '@/lib/ai/generate/brief';

function brief(over: Partial<SiteBrief>): SiteBrief {
    return { ...emptyBrief(), ...over };
}

describe('brief clarity — refuse gibberish before generation', () => {
    it('spots keyboard mash and nonsense tokens', () => {
        expect(textLooksGibberish('asdfgh qwerty')).toBe(true);
        expect(textLooksGibberish('xxxxxx zzzzzz')).toBe(true);
        expect(textLooksGibberish('bcdfghj klmnp')).toBe(true);
        expect(textLooksGibberish('family dental clinic')).toBe(false);
    });

    it('needs a real offering, not fluff', () => {
        expect(offerLooksClear('asdf')).toBe(false);
        expect(offerLooksClear('xyz xyz')).toBe(false);
        expect(offerLooksClear('shop')).toBe(false);
        expect(offerLooksClear('family dental clinic')).toBe(true);
        expect(offerLooksClear('home bakery cakes and brownies')).toBe(true);
    });

    it('accepts ordinary names and places', () => {
        expect(nameLooksClear('Smile Dental')).toBe(true);
        expect(nameLooksClear('Rise')).toBe(true);
        expect(nameLooksClear('asdfgh')).toBe(false);
        expect(placeLooksClear('Pune')).toBe(true);
        expect(placeLooksClear('Koramangala')).toBe(true);
        expect(placeLooksClear('qwerty')).toBe(false);
    });

    it('blocks a filled brief that is still nonsense', () => {
        expect(
            briefErrors(
                brief({
                    name: 'asdfgh',
                    offer: 'qwer zxcv',
                    place: 'xxxxxx',
                }),
            ),
        ).toEqual([UNCLEAR_BRIEF_MESSAGE]);

        expect(
            briefClarityErrors({
                name: 'Mithas Sweets',
                offer: 'kaju katli and laddu for festivals',
                place: 'Old Delhi',
            }),
        ).toEqual([]);
    });

    it('refuses a composed prompt that has no real business in it', () => {
        expect(promptLooksClear('a website for asdf, qwer zxcv, in xxxx')).toBe(false);
        expect(
            promptLooksClear(
                'a website for Smile Dental, family dental clinic, in Koramangala',
            ),
        ).toBe(true);
    });
});
