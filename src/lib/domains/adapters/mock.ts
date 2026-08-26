import type { DomainRegistrar, DomainSearchResult, RegisterInput } from '../registrar';
import { normalizeHostname } from '../hostname';

const QUOTE_TTL_MS = 15 * 60 * 1000;

/** Deterministic mock prices so UI and tests stay stable without credentials. */
function mockPrice(name: string): { priceInr: number; renewalInr: number; available: boolean } {
    const lower = name.toLowerCase();
    if (lower.endsWith('.in')) {
        return { available: !lower.includes('taken'), priceInr: 599, renewalInr: 899 };
    }
    if (lower.endsWith('.com')) {
        return { available: !lower.includes('taken'), priceInr: 999, renewalInr: 1299 };
    }
    return { available: false, priceInr: 0, renewalInr: 0 };
}

export function createMockRegistrar(): DomainRegistrar {
    return {
        async search(name: string): Promise<DomainSearchResult> {
            const hostname = normalizeHostname(name);
            const quote = mockPrice(hostname);
            return {
                ...quote,
                quoteExpiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
            };
        },

        async register(input: RegisterInput) {
            const hostname = normalizeHostname(input.name);
            const quote = mockPrice(hostname);
            if (!quote.available) {
                throw new Error('That domain is not available to register.');
            }
            const expires = new Date();
            expires.setFullYear(expires.getFullYear() + Math.max(1, input.years));
            return {
                registrarRef: `mock:${hostname}`,
                expiresAt: expires.toISOString(),
            };
        },

        async setNameservers() {
            // No-op — mock has no live DNS.
        },

        async renew() {
            throw new Error('Domain renewal is not available yet.');
        },

        async status() {
            return 'unknown' as const;
        },

        async authCode() {
            throw new Error('Transfer-out codes are not available yet.');
        },
    };
}
