import 'server-only';

import { promises as dns } from 'node:dns';

import {
    displayNameForHint,
    hintFromSyncHost,
    type DomainConnectDiscovery,
    type DomainConnectSettings,
} from './types';
import { normalizeHostname, splitRegistrableDomain } from '../hostname';

/**
 * Discover whether Domain Connect is available for this hostname's DNS host.
 * Uses the zone apex (`shop.co.in` → query `_domainconnect.shop.co.in`).
 */
export async function discoverDomainConnect(
    hostname: string,
): Promise<DomainConnectDiscovery> {
    const name = normalizeHostname(hostname);
    const split = splitRegistrableDomain(name);
    // Prefer the registrable zone; for www.shop.in still discover on shop.in.
    const zone = split ? `${split.sld}.${split.tld}` : name.replace(/^www\./, '');

    let syncHost: string | null = null;
    try {
        const records = await dns.resolveTxt(`_domainconnect.${zone}`);
        const flat = records.map((parts) => parts.join('')).join('');
        syncHost = flat.trim().replace(/\.$/, '') || null;
    } catch {
        return {
            supported: false,
            hint: 'other',
            settings: null,
            displayName: null,
            reason:
                'We could not find Domain Connect on this domain. It may not be at GoDaddy (or another supported provider), or DNS is still updating.',
        };
    }

    if (!syncHost) {
        return {
            supported: false,
            hint: 'other',
            settings: null,
            displayName: null,
            reason: 'Domain Connect was not advertised for this domain.',
        };
    }

    const hint = hintFromSyncHost(syncHost);
    let settings: DomainConnectSettings | null = null;

    try {
        const res = await fetch(`https://${syncHost}/v2/${encodeURIComponent(zone)}/settings`, {
            method: 'GET',
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
            const body = (await res.json()) as Record<string, unknown>;
            const urlSyncUX = typeof body.urlSyncUX === 'string' ? body.urlSyncUX : '';
            const urlAPI = typeof body.urlAPI === 'string' ? body.urlAPI : '';
            if (urlSyncUX && urlAPI) {
                settings = {
                    providerName:
                        typeof body.providerName === 'string' ? body.providerName : syncHost,
                    providerDisplayName:
                        typeof body.providerDisplayName === 'string'
                            ? body.providerDisplayName
                            : undefined,
                    urlSyncUX: urlSyncUX.replace(/\/$/, ''),
                    urlAPI: urlAPI.replace(/\/$/, ''),
                    urlAsyncUX:
                        typeof body.urlAsyncUX === 'string' ? body.urlAsyncUX : undefined,
                    width: typeof body.width === 'number' ? body.width : undefined,
                    height: typeof body.height === 'number' ? body.height : undefined,
                };
            }
        }
    } catch {
        // Fall through — we still know the hint from the TXT host.
    }

    if (!settings) {
        return {
            supported: false,
            hint,
            settings: null,
            displayName: displayNameForHint(hint),
            reason: `We found ${displayNameForHint(hint)} but could not load Domain Connect settings. Try again in a minute.`,
        };
    }

    return {
        supported: true,
        hint,
        settings,
        displayName:
            settings.providerDisplayName ||
            displayNameForHint(hint, settings.providerName),
    };
}

/**
 * Check whether our published template is listed at this DNS provider.
 * Soft-fail: if the check errors, assume onboarded (GoDaddy often needs bilateral onboard).
 */
export async function templateListed(
    settings: DomainConnectSettings,
    providerId: string,
    serviceId: string,
): Promise<boolean> {
    try {
        const url = `${settings.urlAPI}/v2/domainTemplates/providers/${encodeURIComponent(providerId)}/services/${encodeURIComponent(serviceId)}`;
        const res = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
