import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRIEF_LIMITS, briefErrors, composeBrief, emptyBrief } from '@/lib/ai/generate/brief';
import { MAX_CLASSIFY_CHARS } from '@/lib/contracts';

// Somebody pasted a 4,500-character brief -- a real one, with sections, sample classes and
// colour tokens -- into a field that takes 500. The textarea showed no limit, counted
// nothing, accepted the paste whole, and the answer came back as "Something in that was not
// accepted", naming neither the field nor the reason.
//
// The cap is fine. Everything around it was not.

const SCHEMAS = readFileSync(join(process.cwd(), 'src/lib/contracts/schemas.ts'), 'utf8');
const FIELDS = readFileSync(
    join(process.cwd(), 'src/components/discovery/BriefFields.tsx'),
    'utf8',
);

function longBrief(field: keyof typeof BRIEF_LIMITS, by: number) {
    return { ...emptyBrief(), name: 'A', offer: 'B', place: 'C', [field]: 'x'.repeat(BRIEF_LIMITS[field] + by) };
}

describe('the brief limits match the schema that enforces them', () => {
    // A form that allows more than the route accepts is a form that loses work at submit.
    it('every limit is the one createProjectSchema uses', () => {
        const brief = SCHEMAS.slice(SCHEMAS.indexOf('brief:'));

        for (const [field, limit] of Object.entries(BRIEF_LIMITS)) {
            const found = brief.match(new RegExp(`${field}:[^\\n]*?max\\((\\d+)\\)`));

            expect(found, `${field} is not capped in createProjectSchema`).toBeTruthy();
            expect(Number(found![1]), `${field} disagrees with the schema`).toBe(limit);
        }
    });
});

describe('the composed prompt fits everywhere it is sent', () => {
    // MAX_CLASSIFY_CHARS went from 500 to 2000 for the custom generation path. The generate
    // route reads the constant and moved with it; createProjectSchema hardcoded 500 and did
    // not. So composeBrief built a 537-character prompt, /generate would have taken it, and
    // project creation refused it at the first step -- with nothing on screen naming the
    // field, because the reason only ever reached the server log.
    it('createProjectSchema caps prompt at the shared constant, not a literal', () => {
        expect(SCHEMAS).toContain('prompt: z.string().max(MAX_CLASSIFY_CHARS)');
        expect(SCHEMAS).not.toMatch(/prompt:\s*z\.string\(\)\.max\(\d+\)/);
    });

    // Every field can be at its own limit at once, and composeBrief adds connective words
    // on top. If that total could exceed what the route takes, the form is a trap.
    it('a brief with every field full still composes to something the route accepts', () => {
        const full = {
            ...emptyBrief(),
            name: 'x'.repeat(BRIEF_LIMITS.name),
            offer: 'y'.repeat(BRIEF_LIMITS.offer),
            place: 'z'.repeat(BRIEF_LIMITS.place),
            phone: '1'.repeat(BRIEF_LIMITS.phone),
            hours: 'h'.repeat(BRIEF_LIMITS.hours),
            extra: 'e'.repeat(BRIEF_LIMITS.extra),
            tone: 'warm' as const,
        };

        expect(composeBrief(full).length).toBeLessThanOrEqual(MAX_CLASSIFY_CHARS);
        expect(briefErrors(full)).toEqual([]);
    });
});

describe('briefErrors catches an over-long field before the request goes out', () => {
    it('says which field, how long it is, and how much to cut', () => {
        const [problem] = briefErrors(longBrief('offer', 4000));

        expect(problem).toContain('What they do');
        expect(problem).toContain('4,500');
        expect(problem).toContain('500');
        expect(problem).toMatch(/shorten it by 4,000/);
    });

    it('checks the optional fields too, not just the three required ones', () => {
        expect(briefErrors(longBrief('extra', 1))).not.toEqual([]);
        expect(briefErrors(longBrief('hours', 1))).not.toEqual([]);
        expect(briefErrors(longBrief('phone', 1))).not.toEqual([]);
    });

    it('stays quiet for a brief that fits', () => {
        const brief = { ...emptyBrief(), name: 'Savor & Stir', offer: 'Cooking classes', place: 'Bangalore' };

        expect(briefErrors(brief)).toEqual([]);
    });

    it('counts what is sent, not what was typed, so trailing space is not an error', () => {
        const brief = { ...emptyBrief(), name: 'A', place: 'C', offer: `${'x'.repeat(500)}     ` };

        expect(briefErrors(brief)).toEqual([]);
    });
});

describe('the form cannot accept more than the route will take', () => {
    it('caps every input at its limit', () => {
        for (const field of Object.keys(BRIEF_LIMITS)) {
            expect(FIELDS, `brief-${field} has no maxLength`).toContain(
                `maxLength={BRIEF_LIMITS.${field}}`,
            );
        }
    });

    it('counts the long one out loud as it fills, and says so at the cap', () => {
        expect(FIELDS).toContain('brief-offer-count');
        expect(FIELDS).toContain('aria-live="polite"');
        expect(FIELDS).toContain('Anything longer was not kept');
    });
});
