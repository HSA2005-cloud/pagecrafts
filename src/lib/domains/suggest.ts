import { normalizeHostname } from './hostname';

const TLDS = ['.in', '.co.in', '.com'] as const;

/** Slug a shop name into a domain label (letters/numbers only). */
export function domainLabelFromSiteName(siteName: string): string {
    const raw = siteName
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '')
        .replace(/^-+|-+$/g, '');
    const clipped = raw.slice(0, 24);
    return clipped.length >= 2 ? clipped : 'mysite';
}

/** Suggest .in / .co.in / .com names from the site title for Go Live. */
export function suggestDomainCandidates(siteName: string): string[] {
    const label = domainLabelFromSiteName(siteName);
    const out: string[] = [];
    for (const tld of TLDS) {
        out.push(normalizeHostname(`${label}${tld}`));
    }
    // Fallbacks if the primary label is too generic / short.
    out.push(normalizeHostname(`get${label}.in`));
    out.push(normalizeHostname(`${label}online.com`));
    return [...new Set(out)];
}
