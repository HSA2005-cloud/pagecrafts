import { describe, expect, it } from 'vitest';
import { domainLabelFromSiteName, suggestDomainCandidates } from '@/lib/domains/suggest';

describe('domain suggestions', () => {
    it('builds .in .co.in and .com candidates from a site name', () => {
        const list = suggestDomainCandidates("Kettle & Co.");
        expect(list[0]).toBe('kettleco.in');
        expect(list).toContain('kettleco.co.in');
        expect(list).toContain('kettleco.com');
    });

    it('falls back when the name is empty', () => {
        expect(domainLabelFromSiteName('   ')).toBe('mysite');
        expect(suggestDomainCandidates('')).toContain('mysite.in');
    });
});
