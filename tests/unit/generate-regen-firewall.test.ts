import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(
    join(process.cwd(), 'src/app/api/v1/projects/[id]/generate/route.ts'),
    'utf8',
);

describe('generate route and look regenerate', () => {
    it('does not run the cross-vertical firewall on generate / regenerate', () => {
        // Ask/edit routes still use the firewall. This one rebuilds from the brief,
        // including "Generate another look" after Set 1 already wrote files.
        expect(route).not.toMatch(/crossVerticalFirewall\s*\(/);
        expect(route).toContain('Generate another look');
    });
});
