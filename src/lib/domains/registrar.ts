/**
 * Registrar seam — same discipline as hosting providers.
 *
 * No file outside `src/lib/domains/adapters/` may name a registrar. Pick the active
 * adapter through `domainRegistrar()` below.
 */

export type DomainStatus =
    | 'available'
    | 'registered'
    | 'expired'
    | 'transferring'
    | 'unknown';

export interface DomainSearchResult {
    available: boolean;
    /** First-year price the customer would see, in INR. */
    priceInr: number;
    /** Renewal price after the first year, in INR. */
    renewalInr: number;
    /** When this quote stops being reliable (ISO). */
    quoteExpiresAt: string;
}

export interface RegisterInput {
    name: string;
    years: number;
    contact: {
        name: string;
        email: string;
        phone: string;
        address: string;
        city: string;
        state: string;
        postcode: string;
        country: string;
    };
}

export interface DomainRegistrar {
    search(name: string): Promise<DomainSearchResult>;
    register(input: RegisterInput): Promise<{ registrarRef: string; expiresAt: string }>;
    /**
     * Point the registered domain at our DNS (Cloudflare nameservers).
     * `registrarRef` is the order id returned from register().
     */
    setNameservers(registrarRef: string, nameservers: string[]): Promise<void>;
    renew(registrarRef: string, years: number): Promise<{ expiresAt: string }>;
    status(registrarRef: string): Promise<DomainStatus>;
    /** Transfer-out authorisation code — non-negotiable. */
    authCode(registrarRef: string): Promise<string>;
}

export { domainRegistrar } from './adapters/pick-registrar';
