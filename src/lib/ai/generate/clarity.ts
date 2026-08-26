/**
 * Whether a brief or free-text prompt is clear enough to build a site from.
 *
 * Missing fields are handled by briefErrors. This catches gibberish, keyboard
 * mash, and descriptions that do not name a real business or place — so we do
 * not invent a site from nonsense.
 */

export const UNCLEAR_BRIEF_MESSAGE =
    'AI cannot create a website with the details you have provided.';

const KEYBOARD_SPAM =
    /(?:asdf|qwer|zxcv|hjkl|qazwsx|abcde|abcdef|xxxxxx|aaaaaa|zzzzzz|lorem ipsum)/i;

function clean(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function lettersOnly(value: string): string {
    return value.toLowerCase().replace(/[^a-z\u00c0-\u024f]/g, '');
}

function words(value: string): string[] {
    return clean(value)
        .toLowerCase()
        .match(/[a-z\u00c0-\u024f0-9]+/g) ?? [];
}

/** A token that looks like a real word, not random letters. */
function looksLikeWord(token: string): boolean {
    if (token.length < 2) return false;
    if (/^\d+$/.test(token)) return true;
    if (KEYBOARD_SPAM.test(token)) return false;
    if (/(.)\1{3,}/.test(token)) return false;

    const letters = lettersOnly(token);
    if (letters.length < 2) return false;

    // Short place/brand names (OM, NY, Goa) are fine.
    if (letters.length <= 4) return /[aeiou\u00e0-\u00fc]/i.test(letters) || letters.length <= 3;

    const vowels = (letters.match(/[aeiou\u00e0-\u00fc]/gi) ?? []).length;
    if (vowels / letters.length < 0.18) return false;

    // Alternating consonant soup with almost no structure.
    if (letters.length >= 8 && vowels <= 1) return false;

    return true;
}

export function textLooksGibberish(value: string): boolean {
    const text = clean(value);
    if (!text) return true;
    if (KEYBOARD_SPAM.test(text)) return true;
    if (/(.)\1{5,}/.test(text)) return true;

    const tokens = words(text);
    if (tokens.length === 0) return true;

    const real = tokens.filter(looksLikeWord);
    if (real.length === 0) return true;

    const letters = lettersOnly(text);
    if (letters.length >= 10) {
        const vowels = (letters.match(/[aeiou\u00e0-\u00fc]/gi) ?? []).length;
        if (vowels / letters.length < 0.15) return true;
    }

    return false;
}

/**
 * The offering must say enough that we know what the business does — not one
 * nonsense token, not "asdf asdf".
 */
export function offerLooksClear(offer: string): boolean {
    const text = clean(offer);
    if (text.length < 8) return false;
    if (textLooksGibberish(text)) return false;

    const real = words(text).filter(looksLikeWord);
    // At least two real words, or one longer phrase that looks like English.
    if (real.length >= 2) return true;
    if (real.length === 1 && real[0]!.length >= 8) return true;
    return false;
}

export function nameLooksClear(name: string): boolean {
    const text = clean(name);
    if (text.length < 2) return false;
    if (KEYBOARD_SPAM.test(text)) return false;
    if (/(.)\1{4,}/.test(text)) return false;
    return !textLooksGibberish(text) || words(text).some(looksLikeWord);
}

export function placeLooksClear(place: string): boolean {
    const text = clean(place);
    if (text.length < 2) return false;
    if (KEYBOARD_SPAM.test(text)) return false;
    if (/(.)\1{4,}/.test(text)) return false;
    const real = words(text).filter(looksLikeWord);
    return real.length >= 1;
}

/** Free-text prompt (composed brief or regenerate instruction). */
export function promptLooksClear(prompt: string): boolean {
    const text = clean(prompt);
    if (text.length < 12) return false;
    if (textLooksGibberish(text)) return false;

    const real = words(text).filter(looksLikeWord);
    // Composed briefs always include "website" — need more than filler.
    const content = real.filter(
        (word) => !['a', 'an', 'the', 'for', 'in', 'and', 'of', 'to', 'website', 'site'].includes(word),
    );
    return content.length >= 3;
}

export function briefClarityErrors(brief: {
    name: string;
    offer: string;
    place: string;
}): string[] {
    const errors: string[] = [];
    if (clean(brief.name) && !nameLooksClear(brief.name)) {
        errors.push(UNCLEAR_BRIEF_MESSAGE);
        return errors;
    }
    if (clean(brief.offer) && !offerLooksClear(brief.offer)) {
        errors.push(UNCLEAR_BRIEF_MESSAGE);
        return errors;
    }
    if (clean(brief.place) && !placeLooksClear(brief.place)) {
        errors.push(UNCLEAR_BRIEF_MESSAGE);
        return errors;
    }
    return errors;
}
