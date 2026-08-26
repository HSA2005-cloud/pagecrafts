import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// "Reading the brief", forever, while the browser polls a job that never moves.
//
// The route answers 202 and lets the build run behind it. On Vercel a function instance can
// be frozen the moment it answers, so a promise nobody registered is killed part-finished.
// With the job in memory this looked like a 404; with the job in Redis it looks worse — the
// row survives at the status it reached and is polled forever.
//
// waitUntil tells the platform to keep the instance alive until the promise settles, and
// maxDuration says how long that may take. Without both, the work is cut off.

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const generate = read('src', 'app', 'api', 'v1', 'projects', '[id]', 'generate', 'route.ts');
const publish = read('src', 'app', 'api', 'v1', 'projects', '[id]', 'publish', 'route.ts');

describe('work that outlives the response is registered with the platform', () => {
    it('hands the run to waitUntil rather than dropping it', () => {
        expect(generate).toContain("from '@vercel/functions'");
        expect(generate).toContain('waitUntil(work)');
    });

    // `void promise` is the shape that loses the work. Keeping this assertion means the
    // fix cannot be undone by a tidy-up that "removes an unused variable".
    it('never fires the run and forgets it', () => {
        expect(generate).not.toMatch(/void runJob\(/);
    });

    it('survives a platform with no request context to register against', () => {
        // Local dev and tests have no Vercel context; waitUntil throws there, and the
        // promise is already running, so the throw must not take the request down.
        expect(generate).toMatch(/try \{\s*\n\s*waitUntil\(work\);\s*\n\s*\} catch \{/);
    });
});

describe('a build is given long enough to finish', () => {
    const durationOf = (source: string) =>
        Number(/export const maxDuration = (\d+)/.exec(source)?.[1] ?? 0);

    it('asks for a ceiling at all', () => {
        expect(durationOf(generate)).toBeGreaterThan(0);
    });

    // classify, expand, plan and one call per section, with rate-limit waits between them.
    // Publishing is a shorter job and already asks for 120.
    it('allows at least as long as publishing does', () => {
        expect(durationOf(generate)).toBeGreaterThanOrEqual(durationOf(publish));
        expect(durationOf(publish)).toBeGreaterThan(0);
    });
});
