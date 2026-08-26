import { describe, expect, it } from 'vitest';

import {
    buildDomainConnectApplyUrl,
    signDomainConnectState,
    verifyDomainConnectState,
    zoneAndHost,
} from '@/lib/domains/domain-connect/apply';
import { displayNameForHint, hintFromSyncHost } from '@/lib/domains/domain-connect/types';

describe('zoneAndHost', () => {
    it('treats apex .in and .co.in as zone-only', () => {
        expect(zoneAndHost('shop.in')).toEqual({ domain: 'shop.in' });
        expect(zoneAndHost('shop.co.in')).toEqual({ domain: 'shop.co.in' });
    });

    it('peels www as host', () => {
        expect(zoneAndHost('www.shop.in')).toEqual({ domain: 'shop.in', host: 'www' });
    });
});

describe('Domain Connect state', () => {
    it('round-trips a signed state payload', () => {
        const state = signDomainConnectState({
            projectId: 'p1',
            userId: 'u1',
            domain: 'shop.in',
            pagesTarget: 'demo.pages.dev',
        });
        const payload = verifyDomainConnectState(state);
        expect(payload?.projectId).toBe('p1');
        expect(payload?.domain).toBe('shop.in');
        expect(payload?.pagesTarget).toBe('demo.pages.dev');
    });

    it('rejects tampered state', () => {
        const state = signDomainConnectState({
            projectId: 'p1',
            userId: 'u1',
            domain: 'shop.in',
            pagesTarget: 'demo.pages.dev',
        });
        expect(verifyDomainConnectState(state + 'x')).toBeNull();
    });
});

describe('buildDomainConnectApplyUrl', () => {
    it('builds a GoDaddy-style sync apply URL with pagesTarget', () => {
        const url = buildDomainConnectApplyUrl({
            settings: {
                providerName: 'GoDaddy',
                urlSyncUX: 'https://dcc.godaddy.com',
                urlAPI: 'https://api.domainconnect.godaddy.com',
            },
            hostname: 'shop.in',
            pagesTarget: 'my-site.pages.dev',
            redirectUri: 'https://pagecrafts.in/api/v1/domains/domain-connect/callback',
            state: 'abc.sig',
            sign: false,
        });
        expect(url).toContain('https://dcc.godaddy.com/v2/domainTemplates/providers/pagecrafts.in/services/website/apply?');
        expect(url).toContain('domain=shop.in');
        expect(url).toContain('pagesTarget=my-site.pages.dev');
        expect(url).toContain('redirect_uri=');
        expect(url).toContain('state=abc.sig');
    });
});

describe('hints', () => {
    it('labels GoDaddy from the sync host', () => {
        expect(hintFromSyncHost('api.domainconnect.godaddy.com')).toBe('godaddy');
        expect(displayNameForHint('godaddy')).toBe('GoDaddy');
    });
});
