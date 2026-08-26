import { describe, expect, it } from 'vitest';

import { explainCreationIssue } from '@/lib/editor/ai-fix';

// Every generation failure said the same sentence: "The website started, but a page or
// section did not complete." It covered a used-up daily allowance, a rate limit, and a reply
// that ran past the output ceiling — three problems with three different answers, one of
// which is "come back tomorrow" and one of which is "shorten your description".
//
// Nobody could tell them apart from the screen, including the people building this. Every
// diagnosis needed the server log. These are the shapes that actually reach the browser.

const DAILY_CAP = [
    'groq: 429 rate_limited — Limit 200000, tokens per day',
    'groq: daily token cap reached for every key',
];

const BUSY = [
    'groq: 429 rate_limited',
    'groq: tokens per minute (TPM) limit reached',
    'too many requests, retry after 12s',
];

const TOO_LONG = [
    'groq: the reply was cut off at the 6000-token output ceiling (compose). '
        + 'Raise AI_OUTPUT_COMPOSE_TOKENS or shorten the request.',
    'groq: 413 payload too large',
];

describe('a failed build says which failure it was', () => {
    it.each(DAILY_CAP)('reads a used-up daily allowance: %s', (message) => {
        const issue = explainCreationIssue(message, 'generation');

        expect(issue.kind).toBe('daily_cap');
        expect(issue.title).toMatch(/budget is used up/i);
        expect(issue.what).toMatch(/resets overnight/i);
    });

    it.each(BUSY)('reads a rate limit as busy, not broken: %s', (message) => {
        const issue = explainCreationIssue(message, 'generation');

        expect(issue.kind).toBe('busy');
        expect(issue.title).toMatch(/busy/i);
    });

    it.each(TOO_LONG)('reads a reply that ran out of room: %s', (message) => {
        const issue = explainCreationIssue(message, 'generation');

        expect(issue.kind).toBe('too_long');
        expect(issue.what).toMatch(/shorter description|ran out of room/i);
    });

    it('still falls back to the general sentence for anything unrecognised', () => {
        const issue = explainCreationIssue('section fill returned nothing', 'generation');

        expect(issue.kind).toBe('generation');
        expect(issue.title).toBe('This site did not finish building');
    });
});

describe('the causes that were already named keep their answers', () => {
    it('puts a missing key ahead of the rate-limit read', () => {
        // "no key configured" must not be mistaken for capacity — waiting will never fix it.
        expect(explainCreationIssue('unsplash api key is not configured', 'generation').kind)
            .toBe('keys');
    });

    it('still recognises a photo failure', () => {
        expect(explainCreationIssue('could not fetch photo for hero', 'generation').kind)
            .toBe('photos');
    });
});

describe('every answer is something a person can act on', () => {
    it.each([...DAILY_CAP, ...BUSY, ...TOO_LONG])('gives an instruction for: %s', (message) => {
        const issue = explainCreationIssue(message, 'generation');

        expect(issue.instruction.length).toBeGreaterThan(20);
        expect(issue.what.length).toBeGreaterThan(20);
    });
});
