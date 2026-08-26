/**
 * Domain Connect — one-click DNS at the customer's registrar (GoDaddy first).
 *
 * Spec: https://www.domainconnect.org/
 * We are the Service Provider. DNS Providers apply our published template after
 * the shop owner taps Authorize on their registrar.
 */

export const DOMAIN_CONNECT_PROVIDER_ID = 'pagecrafts.in';
export const DOMAIN_CONNECT_SERVICE_ID = 'website';

/** Providers we onboard first (order = preference when several match). */
export const DOMAIN_CONNECT_PRIORITY = [
    'godaddy',
    'cloudflare',
    'ionos',
    'namesilo',
] as const;

export type DomainConnectProviderHint = (typeof DOMAIN_CONNECT_PRIORITY)[number] | 'other';

export interface DomainConnectSettings {
    providerName: string;
    providerDisplayName?: string;
    urlSyncUX: string;
    urlAPI: string;
    urlAsyncUX?: string;
    width?: number;
    height?: number;
}

export interface DomainConnectDiscovery {
    supported: boolean;
    hint: DomainConnectProviderHint;
    settings: DomainConnectSettings | null;
    /** Human label for the UI (“GoDaddy”). */
    displayName: string | null;
    reason?: string;
}

export function hintFromSyncHost(host: string): DomainConnectProviderHint {
    const h = host.toLowerCase();
    if (h.includes('godaddy')) return 'godaddy';
    if (h.includes('cloudflare')) return 'cloudflare';
    if (h.includes('ionos') || h.includes('1and1')) return 'ionos';
    if (h.includes('namesilo')) return 'namesilo';
    return 'other';
}

export function displayNameForHint(hint: DomainConnectProviderHint, fallback?: string): string {
    if (hint === 'godaddy') return 'GoDaddy';
    if (hint === 'cloudflare') return 'Cloudflare';
    if (hint === 'ionos') return 'IONOS';
    if (hint === 'namesilo') return 'NameSilo';
    return fallback?.trim() || 'your domain provider';
}
