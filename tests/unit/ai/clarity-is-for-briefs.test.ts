import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { promptLooksClear } from '@/lib/ai/generate/clarity';

// "Make the hero more graphical" came back as "AI cannot create a website with the details
// you have provided" — a message about a brief, for somebody who was not writing one.
//
// assessPromptClarity asks whether a prompt describes a business well enough to build a site
// from: does it name the business, the place, what they do. That is the right question for
// an empty project and the wrong one for an existing site, where the prompt is an
// instruction and names none of those things. The gate refused every edit made through Ask.

const route = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'v1', 'projects', '[id]', 'generate', 'route.ts'),
    'utf8',
);

describe('clarity only judges a brief for a site that does not exist yet', () => {
    it('is skipped when the project already has a site', () => {
        expect(route).toContain('hasExistingSite');
        expect(route).toMatch(/if \(!hasExistingSite\)\s*\{[\s\S]*assessPromptClarity/);
    });

    it('decides that from the same signal the firewall uses', () => {
        expect(route).toMatch(
            /hasExistingSite\s*=\s*\n?\s*\(composition\?\.sections\.length \?\? 0\) > 0 \|\| contentSchema\.sections\.length > 0/,
        );
    });

    it('still runs for a project with nothing in it', () => {
        // Deleting the gate outright would let "asdf asdf" through as a new site.
        expect(route).toContain('assessPromptClarity');
        expect(route).toContain('brief_unclear');
    });

    // Ahead of the caps it answered "we cannot read your brief" to somebody whose real
    // problem was a daily limit — and it costs a model call to say so, which nobody over
    // their limit should pay for.
    it('runs after the caps and before anything is spent', () => {
        const at = (needle: string) => route.indexOf(needle);

        expect(at('checkGenerationBudget')).toBeLessThan(at('assessPromptClarity'));
        expect(at('assertFreeGenerationAllowed')).toBeLessThan(at('assessPromptClarity'));
        expect(at('assessPromptClarity')).toBeLessThan(at('recordGenerationUse('));
    });
});

// Why skipping the gate is the fix rather than loosening it.
//
// promptLooksClear wants three content words after stop-words are removed, which is a fair
// bar for "describe your business" and a wrong one for an instruction. "Rewrite the
// headline" leaves two — and that is a chip the editor itself offers. The app would have
// refused its own suggestion.
describe('the pre-filter is written for briefs, not instructions', () => {
    it('rejects an instruction the editor offers as a suggestion', () => {
        expect(promptLooksClear('Rewrite the headline')).toBe(false);
    });

    it('accepts longer instructions, so the failure is arbitrary from a person’s side', () => {
        for (const instruction of [
            'Make the hero more graphical',
            'Swap the palette for something warmer',
            'Add a contact form under the menu',
        ]) {
            expect(promptLooksClear(instruction), instruction).toBe(true);
        }
    });

    // Two words or twelve, an edit must not be judged by a brief's rules — which is what
    // skipping the gate on an existing site achieves.
    it('still catches what it was actually written for', () => {
        for (const junk of ['asdf asdf', 'aaaaaaaa', 'qwerty qwerty', 'zxcvzxcv', '']) {
            expect(promptLooksClear(junk), junk).toBe(false);
        }
    });
});
