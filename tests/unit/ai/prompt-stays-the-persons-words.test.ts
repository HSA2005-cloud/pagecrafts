import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// The "your site is appearing" panel showed people this as their own brief:
//
//   The person filled in: <data-cd3e7ed0e8 field="text"> a family dental clinic in
//   koramangala </data-cd3e7ed0e8> Expand that into a detailed build brief. Build a
//   complete marketing website with a clear hero, services, about, and contact sections.
//
// Gemini widens a short brief before the build runs, and the runner wrote the widened
// version over job.prompt. That string is an instruction the system wrote to itself, with
// the injection-guard tags still in it, and both the jobs API and the editor read job.prompt
// to show somebody what they asked for.
//
// The expansion is kept beside the original now, in buildPrompt.

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const runner = read('src', 'lib', 'ai', 'jobs', 'runner.ts');
const types = read('src', 'lib', 'ai', 'jobs', 'types.ts');

describe('what the person typed survives the build', () => {
    it('never writes the expansion over the stored prompt', () => {
        expect(runner).not.toMatch(/store\.update\([^)]*\{\s*prompt:\s*buildPrompt/);
    });

    it('keeps the expansion in its own field', () => {
        expect(runner).toContain('store.update(job.id, { buildPrompt })');
        expect(types).toContain('buildPrompt?: string');
    });

    it('still builds from the expanded brief', () => {
        // The point of expanding is that classify and plan see the wider text.
        expect(runner).toContain('classify(buildPrompt)');
        expect(runner).toMatch(/plan\(buildPrompt/);
    });
});

describe('the guard tags never reach a person', () => {
    // contain() wraps model input in <data-xxxx field="..."> so a prompt cannot pose as an
    // instruction. Anything that shows job.prompt would have rendered those tags verbatim.
    it('expands from the original, so the wrapper is built once and thrown away', () => {
        expect(runner).toContain('expandBrief(job.prompt)');
        expect(runner).toMatch(/const buildPrompt = expanded\.data\.expandedPrompt \|\| job\.prompt/);
    });
});
