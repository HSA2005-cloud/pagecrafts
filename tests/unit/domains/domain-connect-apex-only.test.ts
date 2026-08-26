import { describe, expect, it } from 'vitest';

import { buildDomainConnectApplyUrl, zoneAndHost } from '@/lib/domains/domain-connect/apply';
import type { DomainConnectSettings } from '@/lib/domains/domain-connect/types';

// One-click connect points a whole domain at a PageCrafts site. It cannot point a subdomain,
// and the reason is worth stating because the failure is silent and destructive.
//
// The apex record in our template is an APEXCNAME, which means "the root of this zone" by
// definition — it ignores the Domain Connect host parameter. Asking to connect
// shop.mybakery.in therefore sends host=shop and the registrar writes the APEXCNAME onto
// mybakery.in. The person asked for a subdomain and got their main website replaced.
//
// Confirmed in the Domain Connect test tool: domain=example.com host=shop produced a record
// on example.com, not on shop.example.com.

const settings: DomainConnectSettings = {
    urlSyncUX: 'https://dcc.godaddy.com/manage',
} as DomainConnectSettings;

const apply = (hostname: string) =>
    buildDomainConnectApplyUrl({
        settings,
        hostname,
        pagesTarget: 'my-bakery.pages.dev',
        redirectUri: 'https://pagecrafts.in/api/v1/domains/domain-connect/callback',
        state: 'state123',
        sign: false,
    });

describe('a whole domain goes through one-click connect', () => {
    it('builds an apply URL for an apex domain', () => {
        const url = new URL(apply('mybakery.in'));

        expect(url.searchParams.get('domain')).toBe('mybakery.in');
        expect(url.searchParams.get('pagesTarget')).toBe('my-bakery.pages.dev');
        expect(url.pathname).toContain('/providers/pagecrafts.in/services/website/apply');
    });

    // shop.co.in is a registrable name, not a subdomain of shop.in.
    it('treats a multi-part public suffix as an apex', () => {
        expect(zoneAndHost('mybakery.co.in')).toEqual({ domain: 'mybakery.co.in' });
        expect(new URL(apply('mybakery.co.in')).searchParams.get('host')).toBeNull();
    });

    it('never sends a host parameter', () => {
        expect(new URL(apply('mybakery.in')).searchParams.has('host')).toBe(false);
    });
});

describe('a subdomain is refused rather than quietly redirected at the apex', () => {
    it.each([
        'shop.mybakery.in',
        'www.mybakery.in',
        'orders.mybakery.co.in',
    ])('refuses %s', (hostname) => {
        expect(() => apply(hostname)).toThrow();
    });

    // The message is the whole point: somebody typed a subdomain in good faith and needs to
    // know both that this path will not take it and what will.
    it('says what does work instead of only saying no', () => {
        try {
            apply('shop.mybakery.in');
            throw new Error('expected a refusal');
        } catch (err) {
            const message = (err as { message: string }).message;
            expect(message).toMatch(/whole domain/i);
            expect(message).toContain('shop.mybakery.in');
            expect(message).toMatch(/yourself|show you/i);
            expect(message).not.toMatch(/apex|APEXCNAME|zone/i);
        }
    });

    it('keeps the technical reason in the detail, not in the message', () => {
        try {
            apply('shop.mybakery.in');
            throw new Error('expected a refusal');
        } catch (err) {
            expect((err as { detail?: string }).detail).toMatch(/apex-only/i);
        }
    });
});
