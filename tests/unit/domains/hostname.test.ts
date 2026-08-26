import { describe, expect, it } from 'vitest';

import { normalizeHostname, validateHostname } from '@/lib/domains/hostname';

describe('hostname normalize', () => {
    it('strips scheme, path, port, and trailing dots', () => {
        expect(normalizeHostname('https://WWW.Shop.IN/path?x=1')).toBe('www.shop.in');
        expect(normalizeHostname('yourshop.in.')).toBe('yourshop.in');
        expect(normalizeHostname('  YourShop.in:443  ')).toBe('yourshop.in');
    });
});

describe('hostname validate', () => {
    it('accepts apex and subdomain names', () => {
        expect(validateHostname('yourshop.in', { rootDomain: 'pagecrafts.in' })).toEqual({
            ok: true,
            name: 'yourshop.in',
        });
        expect(validateHostname('www.yourshop.in', { rootDomain: 'pagecrafts.in' })).toEqual({
            ok: true,
            name: 'www.yourshop.in',
        });
    });

    it('rejects empty, IP, and free PageCrafts addresses', () => {
        expect(validateHostname('', { rootDomain: 'pagecrafts.in' }).ok).toBe(false);
        expect(validateHostname('1.2.3.4', { rootDomain: 'pagecrafts.in' }).ok).toBe(false);
        expect(validateHostname('pagecrafts.in', { rootDomain: 'pagecrafts.in' }).ok).toBe(false);
        expect(
            validateHostname('raj.pagecrafts.in', { rootDomain: 'pagecrafts.in' }).ok,
        ).toBe(false);
    });

    it('rejects underscores and single-label names', () => {
        expect(validateHostname('bad_name.in', { rootDomain: 'pagecrafts.in' }).ok).toBe(false);
        expect(validateHostname('localhost', { rootDomain: 'pagecrafts.in' }).ok).toBe(false);
    });
});
