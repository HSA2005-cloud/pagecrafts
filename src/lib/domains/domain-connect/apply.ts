import 'server-only';

import { createHmac, createSign, randomBytes, timingSafeEqual } from 'node:crypto';

import {
    DOMAIN_CONNECT_PROVIDER_ID,
    DOMAIN_CONNECT_SERVICE_ID,
    type DomainConnectSettings,
} from './types';
import { ApiError } from '@/lib/errors/respond';
import { normalizeHostname, splitRegistrableDomain } from '../hostname';

const STATE_TTL_MS = 60 * 60 * 1000;

export interface DomainConnectStatePayload {
    projectId: string;
    userId: string;
    domain: string;
    pagesTarget: string;
    exp: number;
    nonce: string;
}

function stateSecret(): string {
    return (
        process.env.DOMAIN_CONNECT_STATE_SECRET?.trim() ||
        process.env.SECRET_MASTER_KEY?.trim() ||
        'pagecrafts-domain-connect-dev'
    );
}

/** Opaque state for the Domain Connect redirect_uri callback. */
export function signDomainConnectState(payload: Omit<DomainConnectStatePayload, 'exp' | 'nonce'>): string {
    const body: DomainConnectStatePayload = {
        ...payload,
        exp: Date.now() + STATE_TTL_MS,
        nonce: randomBytes(8).toString('hex'),
    };
    const json = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    const sig = createHmac('sha256', stateSecret()).update(json).digest('base64url');
    return `${json}.${sig}`;
}

export function verifyDomainConnectState(state: string): DomainConnectStatePayload | null {
    const [json, sig] = state.split('.');
    if (!json || !sig) return null;
    const expected = createHmac('sha256', stateSecret()).update(json).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
        const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as DomainConnectStatePayload;
        if (!payload.projectId || !payload.userId || !payload.domain || !payload.pagesTarget) {
            return null;
        }
        if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

/**
 * Split a full hostname into Domain Connect `domain` (zone) + optional `host` (subdomain).
 * `shop.in` → domain=shop.in, host omitted
 * `www.shop.in` → domain=shop.in, host=www
 * `shop.co.in` → domain=shop.co.in, host omitted
 */
export function zoneAndHost(hostname: string): { domain: string; host?: string } {
    const name = normalizeHostname(hostname);
    const split = splitRegistrableDomain(name);
    if (split) {
        return { domain: `${split.sld}.${split.tld}` };
    }
    // Subdomain of a multi-label name: peel one label as host when possible.
    const parts = name.split('.');
    if (parts.length >= 3) {
        const host = parts[0];
        const domain = parts.slice(1).join('.');
        // If remaining is a known multi-part zone with one label left, treat as apex of that zone.
        const again = splitRegistrableDomain(domain);
        if (again && `${again.sld}.${again.tld}` === domain) {
            return { domain, host };
        }
        return { domain, host };
    }
    return { domain: name };
}

export interface BuildApplyUrlInput {
    settings: DomainConnectSettings;
    hostname: string;
    /** Cloudflare Pages target, e.g. my-site.pages.dev */
    pagesTarget: string;
    redirectUri: string;
    state: string;
    /** Sign the apply query when DOMAIN_CONNECT_PRIVATE_KEY is set (required by Cloudflare). */
    sign?: boolean;
}

/**
 * Build the registrar Authorize URL (synchronous Domain Connect apply).
 */
export function buildDomainConnectApplyUrl(input: BuildApplyUrlInput): string {
    const { domain, host } = zoneAndHost(input.hostname);

    // Our template is apex-only, and a subdomain request through it is destructive.
    //
    // The apex record is an APEXCNAME, and APEXCNAME means "the root of this zone" by
    // definition — it ignores the host parameter. So asking to connect shop.mybakery.in
    // sends host=shop, and the registrar writes the APEXCNAME onto mybakery.in: the
    // customer's existing website, replaced by a page they did not ask to put there. The
    // Domain Connect test tool shows this plainly — host=shop still produced a record on
    // example.com.
    //
    // Refused here rather than papered over, because there is no safe way to send this
    // request. Subdomains still work through the manual DNS instructions, which write a
    // plain CNAME on the label the person actually named.
    if (host) {
        throw new ApiError(
            'validation_failed',
            'One-click connect works on a whole domain, like mybakery.in. '
                + `To point ${input.hostname} here, add the DNS record yourself — `
                + 'we will show you exactly what to add.',
            `domain-connect is apex-only; refused host=${host} on ${domain}`,
        );
    }

    const base = `${input.settings.urlSyncUX}/v2/domainTemplates/providers/${encodeURIComponent(DOMAIN_CONNECT_PROVIDER_ID)}/services/${encodeURIComponent(DOMAIN_CONNECT_SERVICE_ID)}/apply`;

    const params = new URLSearchParams();
    params.set('domain', domain);
    params.set('pagesTarget', input.pagesTarget.replace(/\.$/, ''));
    params.set('redirect_uri', input.redirectUri);
    params.set('state', input.state);
    params.set('providerName', 'PageCrafts');
    params.set('serviceName', 'Website');

    let query = params.toString();

    if (input.sign !== false) {
        const signed = maybeSignApplyQuery(query);
        if (signed) query = signed;
    }

    return `${base}?${query}`;
}

/**
 * RSA-SHA256 sign the query string per Domain Connect sync signing.
 * Private key PEM in DOMAIN_CONNECT_PRIVATE_KEY; public key published at
 * syncPubKeyDomain (see docs/domain-connect/).
 */
function maybeSignApplyQuery(query: string): string | null {
    const pem = process.env.DOMAIN_CONNECT_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
    const keyId = process.env.DOMAIN_CONNECT_KEY_ID?.trim() || '1';
    if (!pem) return null;

    try {
        const signer = createSign('RSA-SHA256');
        signer.update(query);
        signer.end();
        const sig = signer.sign(pem, 'base64');
        // Spec: sig and key must be last parameters.
        return `${query}&key=${encodeURIComponent(keyId)}&sig=${encodeURIComponent(sig)}`;
    } catch {
        return null;
    }
}

export function domainConnectCallbackUrl(appOrigin: string): string {
    return `${appOrigin.replace(/\/$/, '')}/api/v1/domains/domain-connect/callback`;
}
