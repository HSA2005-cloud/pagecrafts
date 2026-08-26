import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ADAPTERS = join('src', 'lib', 'deploy', 'adapters');
const PROVIDER = /octokit|api\.github\.com|github-pages|githubPages|cloudflare|wrangler/i;

function files(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) files(full, out);
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

describe('NFR-041 · provider isolation', () => {
    it('no file outside the adapters folder names the hosting provider', () => {
        const offenders = files('src')
            .filter((f) => !f.includes(ADAPTERS))
            .filter((f) => !f.includes(join('src', 'lib', 'domains')) && !f.includes(join('src', 'lib', 'data', 'domains.ts')))
            .filter((f) => PROVIDER.test(readFileSync(f, 'utf8')));

        expect(offenders).toEqual([]);
    });
});