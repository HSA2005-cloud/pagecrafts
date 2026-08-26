import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { editProposalSchema } from '@/lib/ai/gateway/response-schemas';
import { editProposal } from '@/lib/contracts/schemas/ai';

// "We could not finish that just now. Your work is safe in this tab" — the message for
// `internal`, which is a 500, on an instruction the edit path can perfectly well carry out
// ("rewrite the hero heading so it names the business and what it sells").
//
// proposeEdit was the only AI call in the codebase that sent no schema. classify, fill,
// expand and compose all pass one, and that is what puts response_format on the request. A
// model free to answer in prose sometimes did, JSON.parse threw a SyntaxError nothing
// caught, and it surfaced as a server error.

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const propose = read('src', 'lib', 'ai', 'edit', 'propose.ts');
const rewrite = read('src', 'lib', 'ai', 'edit', 'rewrite-copy.ts');

describe('an edit request tells the provider what shape to answer in', () => {
    it('sends a schema, like every other stage', () => {
        expect(propose).toMatch(/schema:\s*editProposalSchema/);
    });

    it('describes both fields the proposal needs', () => {
        expect(editProposalSchema.required).toEqual(
            expect.arrayContaining(['changes', 'explanation']),
        );
        expect(editProposalSchema.properties).toHaveProperty('changes');
        expect(editProposalSchema.properties).toHaveProperty('explanation');
    });

    // `changes` is a bag of section fields whose names depend on the section, so the wire
    // schema cannot enumerate them. editProposal in contracts is what checks the contents.
    it('leaves the contents to the contract schema', () => {
        expect(editProposal.safeParse({
            changes: { heading: 'Savour & Stir' },
            explanation: 'Named the business in the heading.',
        }).success).toBe(true);

        expect(editProposal.safeParse({ changes: {} }).success).toBe(false);
        expect(editProposal.safeParse({ explanation: 'x' }).success).toBe(false);
    });
});

describe('a reply that is not JSON is an error, not a 500', () => {
    it('guards the parse in propose', () => {
        expect(propose).toMatch(/try\s*\{[\s\S]{0,120}JSON\.parse[\s\S]{0,80}\}\s*catch/);
    });

    it('says what went wrong rather than throwing SyntaxError', () => {
        expect(propose).toMatch(/did not return JSON/i);
    });

    // This one already had the guard. Keeping the assertion so both paths stay covered.
    it('guards the parse in rewrite-copy too', () => {
        expect(rewrite).toMatch(/try\s*\{[\s\S]{0,120}JSON\.parse[\s\S]{0,80}\}\s*catch/);
    });
});
