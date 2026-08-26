import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MAX_INSTRUCTION_CHARS } from '@/lib/contracts';

// "That change did not go through. The last request could not be turned into a suggestion."
//
// The composer set maxLength={500} and the route accepted max(300), so every instruction
// between the two was typed, sent, and refused — with nothing on screen about length, and a
// Fix-with-AI button that resent the same too-long text and failed the same way.
//
// One constant now. This test exists because the two numbers lived in different files and
// nothing connected them, which is exactly how they drifted apart.

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const composer = read('src', 'components', 'editor', 'ChatComposer.tsx');
const route = read('src', 'app', 'api', 'v1', 'projects', '[id]', 'edits', 'route.ts');

describe('the box and the route agree on how much you may type', () => {
    it('neither hard-codes its own number', () => {
        expect(composer).not.toMatch(/maxLength=\{\s*\d+\s*\}/);
        expect(route).not.toMatch(/instruction:\s*z\.string\(\)\.min\(1\)\.max\(\d+\)/);
    });

    it('both read the shared constant', () => {
        expect(composer).toContain('MAX_INSTRUCTION_CHARS');
        expect(route).toContain('MAX_INSTRUCTION_CHARS');
    });

    it('leaves room for a real instruction', () => {
        // 300 was about fifty words — not enough to describe a change to a page.
        expect(MAX_INSTRUCTION_CHARS).toBeGreaterThanOrEqual(1_000);
    });

    // The provider ceiling is GROQ_MAX_REQUEST_TOKENS (8,000 tokens, roughly 32,000
    // characters) and the section being edited goes in the same request.
    it('stays well inside what the provider will accept', () => {
        expect(MAX_INSTRUCTION_CHARS).toBeLessThanOrEqual(8_000);
    });
});

describe('the limit is visible before it is hit', () => {
    it('shows a counter tied to the field', () => {
        expect(composer).toContain('editor-follow-up-count');
        expect(composer).toContain('aria-describedby="editor-follow-up-count"');
    });

    it('announces the count as it changes', () => {
        expect(composer).toContain('aria-live="polite"');
    });

    it('says what to do when the limit is reached', () => {
        expect(composer).toMatch(/character limit reached/i);
    });
});
