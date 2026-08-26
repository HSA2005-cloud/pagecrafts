import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ADAPTERS = join('src', 'lib', 'domains', 'adapters');
const REGISTRAR =
    /resellerclub|logicboxes|godaddy|namecheap|dynadot|openprovider|opensrs|httpapi\.com/i;

function files(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) files(full, out);
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

describe('domain registrar isolation', () => {
    it('no file outside domains/adapters names a registrar', () => {
        const offenders = files('src')
            .filter((f) => !f.includes(ADAPTERS))
            // Domain Connect DNS-provider hints (GoDaddy etc.) are not the buy/registrar seam.
            .filter((f) => !f.includes(`${join('domains', 'domain-connect')}`))
            .filter((f) => REGISTRAR.test(readFileSync(f, 'utf8')));

        expect(offenders).toEqual([]);
    });
});
