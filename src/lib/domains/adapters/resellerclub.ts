import 'server-only';

import { randomBytes } from 'node:crypto';

import type { DomainRegistrar, DomainSearchResult, RegisterInput } from '../registrar';
import { normalizeHostname, splitRegistrableDomain } from '../hostname';

const QUOTE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_BASE = 'https://httpapi.com/api';
const DEMO_BASE = 'https://test.httpapi.com/api';

interface ResellerClubConfig {
    userId: string;
    apiKey: string;
    apiBase?: string;
}

type ApiObject = Record<string, unknown>;

function isDemoBase(base: string): boolean {
    return base.includes('test.httpapi.com');
}

function defaultNameservers(base: string): [string, string] {
    const ns1 = process.env.RESELLERCLUB_NS1?.trim();
    const ns2 = process.env.RESELLERCLUB_NS2?.trim();
    if (ns1 && ns2) return [ns1, ns2];
    if (isDemoBase(base)) return ['ns1.onlyfordemo.net', 'ns2.onlyfordemo.net'];
    // Live registration requires the reseller's own (or free DNS) NS pair.
    throw new Error(
        'Set RESELLERCLUB_NS1 and RESELLERCLUB_NS2 to your ResellerClub nameservers before registering domains.',
    );
}

function parsePhone(raw: string): { phoneCc: string; phone: string } {
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 12 && digits.startsWith('91')) {
        return { phoneCc: '91', phone: digits.slice(2) };
    }
    if (digits.length === 10) {
        return { phoneCc: '91', phone: digits };
    }
    if (digits.length > 2) {
        return { phoneCc: digits.slice(0, 2), phone: digits.slice(2) };
    }
    return { phoneCc: '91', phone: '9999999999' };
}

function apiErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const obj = payload as ApiObject;
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
    if (typeof obj.error === 'string' && obj.error.trim()) return obj.error;
    if (obj.status === 'ERROR' || obj.status === 'error') {
        return typeof obj.message === 'string' ? obj.message : 'Registrar returned an error.';
    }
    return null;
}

/**
 * Reseller adapter (LogicBoxes HTTP API).
 *
 * Search → create/find customer → contact → register → setNameservers (Cloudflare).
 */
export function createResellerClubRegistrar(config: ResellerClubConfig): DomainRegistrar {
    const base = (config.apiBase ?? process.env.RESELLERCLUB_API_BASE ?? DEFAULT_BASE).replace(
        /\/$/,
        '',
    );

    async function callJson<T>(
        method: 'GET' | 'POST',
        path: string,
        params: Record<string, string | string[]>,
    ): Promise<T> {
        const url = new URL(`${base}${path}`);
        url.searchParams.set('auth-userid', config.userId);
        url.searchParams.set('api-key', config.apiKey);

        const body = new URLSearchParams();
        body.set('auth-userid', config.userId);
        body.set('api-key', config.apiKey);

        for (const [key, value] of Object.entries(params)) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    url.searchParams.append(key, item);
                    body.append(key, item);
                }
            } else {
                url.searchParams.set(key, value);
                body.set(key, value);
            }
        }

        const res = await fetch(method === 'GET' ? url : `${base}${path}`, {
            method,
            headers:
                method === 'POST'
                    ? { 'content-type': 'application/x-www-form-urlencoded' }
                    : undefined,
            body: method === 'POST' ? body : undefined,
            cache: 'no-store',
            signal: AbortSignal.timeout(45_000),
        });

        const payload = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) {
            throw new Error(
                apiErrorMessage(payload) ?? `Registrar request failed (${res.status}).`,
            );
        }
        const err = apiErrorMessage(payload);
        if (err) throw new Error(err);
        return payload as T;
    }

    async function findOrCreateCustomer(contact: RegisterInput['contact']): Promise<string> {
        const fixed = process.env.RESELLERCLUB_CUSTOMER_ID?.trim();
        if (fixed) return fixed;

        const email = contact.email.trim().toLowerCase();
        try {
            const existing = await callJson<ApiObject>('GET', '/customers/details.json', {
                username: email,
            });
            const id =
                existing.customerid ??
                existing.customerId ??
                existing['customer-id'] ??
                existing.entityid;
            if (id != null) return String(id);
        } catch {
            // Not found — create below.
        }

        const phone = parsePhone(contact.phone);
        const password = `${randomBytes(12).toString('base64url')}Aa1!`;
        const created = await callJson<number | string | ApiObject>(
            'POST',
            '/customers/v2/signup.json',
            {
                username: email,
                passwd: password,
                name: contact.name.slice(0, 50) || 'PageCrafts customer',
                company: contact.name.slice(0, 50) || 'Individual',
                'address-line-1': contact.address.slice(0, 64) || 'Not provided',
                city: contact.city || 'Bengaluru',
                state: contact.state || 'KA',
                country: (contact.country || 'IN').slice(0, 2).toUpperCase(),
                zipcode: contact.postcode || '560001',
                'phone-cc': phone.phoneCc,
                phone: phone.phone,
                'lang-pref': 'en',
            },
        );

        if (typeof created === 'number' || typeof created === 'string') {
            return String(created);
        }
        const id =
            (created as ApiObject).customerid ??
            (created as ApiObject).customerId ??
            (created as ApiObject)['customer-id'];
        if (id == null) {
            throw new Error('Registrar did not return a customer id.');
        }
        return String(id);
    }

    async function addContact(
        customerId: string,
        contact: RegisterInput['contact'],
    ): Promise<string> {
        const phone = parsePhone(contact.phone);
        const created = await callJson<number | string | ApiObject>('POST', '/contacts/add.json', {
            'customer-id': customerId,
            name: contact.name.slice(0, 50) || 'PageCrafts customer',
            company: contact.name.slice(0, 50) || 'Individual',
            email: contact.email.trim().toLowerCase(),
            'address-line-1': contact.address.slice(0, 64) || 'Not provided',
            city: contact.city || 'Bengaluru',
            state: contact.state || 'KA',
            country: (contact.country || 'IN').slice(0, 2).toUpperCase(),
            zipcode: contact.postcode || '560001',
            'phone-cc': phone.phoneCc,
            phone: phone.phone,
            type: 'Contact',
        });

        if (typeof created === 'number' || typeof created === 'string') {
            return String(created);
        }
        const id =
            (created as ApiObject).contactid ??
            (created as ApiObject).contactId ??
            (created as ApiObject)['contact-id'] ??
            (created as ApiObject).entityid;
        if (id == null) {
            throw new Error('Registrar did not return a contact id.');
        }
        return String(id);
    }

    return {
        async search(name: string): Promise<DomainSearchResult> {
            const hostname = normalizeHostname(name);
            const split = splitRegistrableDomain(hostname);
            if (!split) {
                return {
                    available: false,
                    priceInr: 0,
                    renewalInr: 0,
                    quoteExpiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
                };
            }

            const { sld, tld } = split;
            const availability = await callJson<Record<string, { status?: string } | string>>(
                'GET',
                '/domains/available.json',
                {
                    'domain-name': sld,
                    tlds: tld,
                },
            );

            const entry = availability[hostname] ?? availability[`${sld}.${tld}`];
            const status =
                typeof entry === 'string'
                    ? entry
                    : typeof entry === 'object' && entry
                      ? entry.status
                      : undefined;
            const available = (status ?? '').toLowerCase() === 'available';

            let priceInr = 0;
            let renewalInr = 0;

            if (available) {
                try {
                    const prices = await callJson<
                        Record<
                            string,
                            {
                                addnewdomain?: Record<string, string>;
                                renewdomain?: Record<string, string>;
                            }
                        >
                    >('GET', '/products/customer-price.json', {
                        'product-key': 'dom',
                    });
                    const forTld = prices[tld] ?? prices[`.${tld}`];
                    const add = forTld?.addnewdomain?.['1'];
                    const renew = forTld?.renewdomain?.['1'];
                    priceInr = add ? Math.ceil(Number(add)) : 0;
                    renewalInr = renew ? Math.ceil(Number(renew)) : priceInr;
                } catch {
                    priceInr = 0;
                    renewalInr = 0;
                }
            }

            return {
                available,
                priceInr,
                renewalInr,
                quoteExpiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
            };
        },

        async register(input: RegisterInput) {
            const hostname = normalizeHostname(input.name);
            const split = splitRegistrableDomain(hostname);
            if (!split) {
                throw new Error('That domain name cannot be registered.');
            }

            const quote = await this.search(hostname);
            if (!quote.available) {
                throw new Error('That domain is not available to register.');
            }

            const customerId = await findOrCreateCustomer(input.contact);
            const contactId = await addContact(customerId, input.contact);
            const [ns1, ns2] = defaultNameservers(base);

            const years = Math.max(1, Math.min(10, input.years || 1));
            const result = await callJson<ApiObject>('POST', '/domains/register.json', {
                'domain-name': hostname,
                years: String(years),
                ns: [ns1, ns2],
                'customer-id': customerId,
                'reg-contact-id': contactId,
                'admin-contact-id': contactId,
                'tech-contact-id': contactId,
                'billing-contact-id': contactId,
                'invoice-option': 'NoInvoice',
                'auto-renew': 'false',
            });

            const orderId =
                result.entityid ??
                result.orderid ??
                result['order-id'] ??
                result.entityId;
            if (orderId == null) {
                throw new Error('Registrar did not return an order id after register.');
            }

            const expires = new Date();
            expires.setFullYear(expires.getFullYear() + years);
            const endtime = result.endtime ?? result.endTime;
            if (typeof endtime === 'number') {
                expires.setTime(endtime * (endtime < 1e12 ? 1000 : 1));
            } else if (typeof endtime === 'string' && /^\d+$/.test(endtime)) {
                const n = Number(endtime);
                expires.setTime(n * (n < 1e12 ? 1000 : 1));
            }

            return {
                registrarRef: String(orderId),
                expiresAt: expires.toISOString(),
            };
        },

        async setNameservers(registrarRef: string, nameservers: string[]) {
            const ns = nameservers.map((n) => n.trim()).filter(Boolean);
            if (ns.length < 2) {
                throw new Error('At least two nameservers are required.');
            }
            await callJson<ApiObject>('POST', '/domains/modify-ns.json', {
                'order-id': registrarRef,
                ns,
            });
        },

        async renew() {
            throw new Error('Domain renewal is not wired yet.');
        },

        async status() {
            return 'unknown' as const;
        },

        async authCode(registrarRef: string) {
            const details = await callJson<ApiObject>('GET', '/domains/details.json', {
                'order-id': registrarRef,
                options: 'OrderDetails',
            });
            const code = details.domsecret ?? details['dom-secret'] ?? details.authcode;
            if (typeof code !== 'string' || !code.trim()) {
                throw new Error('Transfer-out code is not available yet for this domain.');
            }
            return code.trim();
        },
    };
}

/** Exported for tests — resolves which HTTP API host we would call. */
export function resellerClubApiBase(): string {
    return (process.env.RESELLERCLUB_API_BASE ?? DEFAULT_BASE).replace(/\/$/, '');
}

export { DEMO_BASE as RESELLERCLUB_DEMO_API_BASE };
