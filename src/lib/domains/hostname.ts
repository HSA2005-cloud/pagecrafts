/**
 * Hostname helpers for custom domains.
 *
 * Kept free of hosting-provider and registrar names so unit tests and the UI can share them.
 */

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** Multi-part public suffixes we sell (order longer first when matching). */
const MULTI_PART_TLDS = ['co.in'] as const;

/** Strip scheme/path/port/trailing dots and lowercase. */
export function normalizeHostname(raw: string): string {
    let value = raw.trim().toLowerCase();
    value = value.replace(/^https?:\/\//, '');
    value = value.split('/')[0] ?? value;
    value = value.split('?')[0] ?? value;
    value = value.split('#')[0] ?? value;
    value = value.replace(/:\d+$/, '');
    value = value.replace(/\.+$/, '');
    return value;
}

/**
 * Accept a public hostname (apex or subdomain). Rejects empty, IP literals, and
 * reserved PageCrafts free addresses.
 */
export function validateHostname(
    raw: string,
    options?: { rootDomain?: string },
): { ok: true; name: string } | { ok: false; reason: string } {
    const name = normalizeHostname(raw);

    if (!name) {
        return { ok: false, reason: 'Enter a domain name like yourshop.in.' };
    }

    if (name.length > 253) {
        return { ok: false, reason: 'That domain name is too long.' };
    }

    if (name.includes(' ') || name.includes('_')) {
        return { ok: false, reason: 'Domain names cannot include spaces or underscores.' };
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) {
        return { ok: false, reason: 'Use a domain name, not an IP address.' };
    }

    const labels = name.split('.');
    if (labels.length < 2) {
        return { ok: false, reason: 'Include the ending, for example .in or .com.' };
    }

    if (!labels.every((label) => LABEL.test(label))) {
        return {
            ok: false,
            reason: 'Use only letters, numbers, and hyphens in each part of the name.',
        };
    }

    const root = (options?.rootDomain ?? process.env.ROOT_DOMAIN ?? 'pagecrafts.in').toLowerCase();
    if (name === root || name.endsWith(`.${root}`)) {
        return {
            ok: false,
            reason: `That is already a free PageCrafts address. Enter a domain you own elsewhere.`,
        };
    }

    return { ok: true, name };
}

/**
 * Split a hostname into registrable label + TLD for registrar APIs.
 * Handles `.co.in` (and other MULTI_PART_TLDS) so we do not treat `co` as the SLD.
 */
export function splitRegistrableDomain(
    hostname: string,
): { sld: string; tld: string } | null {
    const name = normalizeHostname(hostname);
    for (const multi of MULTI_PART_TLDS) {
        if (name === multi || name.endsWith(`.${multi}`)) {
            const sld = name.slice(0, -(multi.length + 1));
            if (!sld || sld.includes('.')) return null;
            return { sld, tld: multi };
        }
    }
    const parts = name.split('.');
    if (parts.length < 2) return null;
    const tld = parts.pop()!;
    const sld = parts.join('.');
    if (!sld || sld.includes('.')) return null;
    return { sld, tld };
}

/** True for apex names we sell (`shop.in`, `shop.co.in`), false for subdomains. */
export function isApexHostname(name: string): boolean {
    return splitRegistrableDomain(name) !== null;
}
