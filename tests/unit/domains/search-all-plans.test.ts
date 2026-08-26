import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createMockRegistrar } from '@/lib/domains/adapters/mock';

const searchRoute = readFileSync(
    join(process.cwd(), 'src/app/api/v1/domains/search/route.ts'),
    'utf8',
);
const dialog = readFileSync(
    join(process.cwd(), 'src/components/editor/CustomDomainDialog.tsx'),
    'utf8',
);

describe('domain search is available on every plan', () => {
    it('does not Premium-gate the search route', () => {
        expect(searchRoute).not.toMatch(/planCovers/);
        expect(searchRoute).not.toMatch(/payment_required/);
        expect(searchRoute).not.toMatch(/Premium/);
        expect(searchRoute).toContain("auth: \"required\"");
    });

    it('does not show a plan upgrade CTA in the Buy tab', () => {
        expect(dialog).not.toMatch(/upgrade/i);
        expect(dialog).not.toMatch(/Premium/);
        expect(dialog).toContain('Coming soon — purchase not wired yet');
    });

    it('returns a quote from the mock registrar for Starter-usable search', async () => {
        const quote = await createMockRegistrar().search('myshop.in');
        expect(quote.available).toBe(true);
        expect(quote.priceInr).toBeGreaterThan(0);
        expect(Date.parse(quote.quoteExpiresAt)).toBeGreaterThan(Date.now());
    });
});
