import 'server-only';
import type { PublishFile } from '@/lib/contracts/deploy';
import type {
    AttachCustomDomainResult,
    CustomDomainDnsRecord,
    CustomDomainHostStatus,
    DeployProvider,
    ProvisionInput,
    ProvisionResult,
} from '../provider';
import { normalizeHostname, isApexHostname } from '@/lib/domains/hostname';
import { deployConfig } from '../config';
import { toSlug, isReserved } from '../slug';
import { pollUntilLive } from '../verify';
import { cf, accountPath } from './cloudflare-client';
import { HostingError } from './hosting-error';
import { pushPagesDirectUpload } from './pages-direct-upload';

interface PagesDomainResult {
    id?: string;
    name?: string;
    status?: string;
    validation_data?: {
        method?: string;
        status?: string;
        txt_name?: string;
        txt_value?: string;
    };
    verification_data?: {
        status?: string;
        error_message?: string;
    };
}

function pagesDevTarget(siteId: string): string {
    return `${siteId}.pages.dev`;
}

function dnsRecordsFor(hostname: string, target: string, attached: PagesDomainResult): CustomDomainDnsRecord[] {
    const apex = isApexHostname(hostname);
    const records: CustomDomainDnsRecord[] = [
        {
            type: apex ? 'ALIAS' : 'CNAME',
            host: hostname,
            value: target,
            note: apex
                ? 'Apex domains need CNAME flattening or an ALIAS record. If your DNS host does not support that, use www and redirect the apex.'
                : undefined,
        },
    ];

    const txtName = attached.validation_data?.txt_name;
    const txtValue = attached.validation_data?.txt_value;
    if (txtName && txtValue) {
        records.push({ type: 'TXT', host: txtName, value: txtValue });
    }

    return records;
}

function mapDomainStatus(attached: PagesDomainResult): CustomDomainHostStatus {
    const status = (attached.status ?? '').toLowerCase();
    const verification = (attached.verification_data?.status ?? '').toLowerCase();

    if (status === 'active' || verification === 'active') return 'active';
    if (
        status === 'error' ||
        status === 'blocked' ||
        status === 'deactivated' ||
        verification === 'deactivated'
    ) {
        return 'failed';
    }
    return 'pending';
}

async function projectExists(name: string): Promise<boolean> {
    try {
        await cf('GET', accountPath(`/pages/projects/${name}`));
        return true;
    } catch (error) {
        if (error instanceof HostingError && error.status === 404) return false;
        throw error;
    }
}

/**
 * The Cloudflare zone that owns our root domain, looked up once.
 *
 * The deploy token carries Zone:Read for exactly this call and Zone:DNS:Edit for the
 * record it leads to -- both were scoped for it on D5 and neither was used until D20.
 */
let cachedZoneId: string | null = null;

async function zoneId(): Promise<string> {
    if (cachedZoneId) return cachedZoneId;

    const root = deployConfig().rootDomain;
    const zones = await cf<{ id: string; name: string }[]>('GET', `/zones?name=${root}`);
    const zone = zones[0];

    if (!zone) {
        throw new Error(
            `No Cloudflare zone for ${root}. The domain must be on Cloudflare and the ` +
                'deploy token needs Zone:Read on it.',
        );
    }

    cachedZoneId = zone.id;
    return cachedZoneId;
}

export const cloudflarePagesAdapter: DeployProvider = {
    async provisionSite({ projectName }: ProvisionInput): Promise<ProvisionResult> {
        const subdomain = toSlug(projectName);

        if (isReserved(subdomain)) {
            throw new HostingError(
                'That site name is reserved. Choose another name.',
                409,
            );
        }

        if (await projectExists(subdomain)) {
            throw new HostingError(
                'That site address is already taken. Choose another name.',
                409,
            );
        }

        await cf('POST', accountPath('/pages/projects'), {
            name: subdomain,
            production_branch: 'main',
        });

        return {
            siteId: subdomain,
            subdomain,
            predictedUrl: `https://${subdomain}.${deployConfig().rootDomain}`,
        };
    },

    // Cloudflare Pages projects are named by the subdomain itself, so the id is the address.
    addressFor(siteId: string) {
        return {
            subdomain: siteId,
            url: `https://${siteId}.${deployConfig().rootDomain}`,
        };
    },

    async pushBuild(siteId: string, files: PublishFile[]) {
        // Direct Upload API — do not shell out to wrangler. On Vercel the CLI
        // package is incomplete (missing wrangler-dist/cli.js), which aborted
        // every Go Live after Cloudflare auth started working.
        return pushPagesDirectUpload(siteId, files);
    },

    async enableHosting(siteId: string): Promise<void> {
        const domain = `${siteId}.${deployConfig().rootDomain}`;
        const zone = await zoneId();

        // Attach domain + write DNS in parallel — both are independent once zone is known.
        await Promise.all([
            cf('POST', accountPath(`/pages/projects/${siteId}/domains`), {
                name: domain,
            }).catch((error: unknown) => {
                if (!(error instanceof HostingError && error.status === 409)) throw error;
            }),
            cf('POST', `/zones/${zone}/dns_records`, {
                type: 'CNAME',
                name: siteId,
                content: `${siteId}.pages.dev`,
                proxied: true,
                comment: 'PageCraft published site',
            }).catch((error: unknown) => {
                if (!(error instanceof HostingError && error.status === 400)) throw error;
            }),
        ]);

        // Read the record back before calling this done.
        //
        // Cloudflare answers 400 both for "that record is already there" and for every
        // reason a record cannot be written, and cf() keeps only the HTTP status — the
        // error code that tells them apart is discarded. So the catch above cannot know
        // which it swallowed, and a publish that wrote nothing reported success. The
        // address then answered NXDOMAIN, which nobody sees until they open the link.
        //
        // Asking the zone is the one answer that is not a guess.
        const records = await cf<{ id: string }[]>(
            'GET',
            `/zones/${zone}/dns_records?type=CNAME&name=${domain}`,
        ).catch(() => [] as { id: string }[]);

        if (!records?.length) {
            throw new HostingError(
                `The site was uploaded but ${domain} has no DNS record, so the address `
                    + 'will not resolve. Publishing again usually fixes it.',
                502,
            );
        }
    },

    async verifyLive(url: string): Promise<boolean> {
        // Single short probe — publish marks live after push+DNS without long polling.
        return pollUntilLive(url, { timeoutMs: 2_000, intervalMs: 500 });
    },

    async removeSite(siteId: string): Promise<void> {
        await cf('DELETE', accountPath(`/pages/projects/${siteId}`));
    },

    async attachCustomDomain(siteId: string, hostname: string): Promise<AttachCustomDomainResult> {
        const target = pagesDevTarget(siteId);
        let attached: PagesDomainResult;

        try {
            attached = await cf<PagesDomainResult>(
                'POST',
                accountPath(`/pages/projects/${siteId}/domains`),
                { name: hostname },
            );
        } catch (error) {
            // Already attached — read it back so we can still return DNS instructions.
            if (!(error instanceof HostingError && error.status === 409)) throw error;
            attached = await cf<PagesDomainResult>(
                'GET',
                accountPath(`/pages/projects/${siteId}/domains/${encodeURIComponent(hostname)}`),
            );
        }

        return {
            hostname,
            target,
            records: dnsRecordsFor(hostname, target, attached),
        };
    },

    async domainStatus(siteId: string, hostname: string): Promise<CustomDomainHostStatus> {
        try {
            // PATCH retries validation on the host side when DNS may have just been updated.
            await cf(
                'PATCH',
                accountPath(`/pages/projects/${siteId}/domains/${encodeURIComponent(hostname)}`),
                {},
            ).catch(() => undefined);

            const attached = await cf<PagesDomainResult>(
                'GET',
                accountPath(`/pages/projects/${siteId}/domains/${encodeURIComponent(hostname)}`),
            );
            return mapDomainStatus(attached);
        } catch (error) {
            if (error instanceof HostingError && error.status === 404) return 'failed';
            throw error;
        }
    },

    async ensureDnsZone(hostname: string): Promise<{ nameservers: string[] }> {
        const name = normalizeHostname(hostname);
        const accountId = deployConfig().accountId;

        type ZoneResult = {
            id?: string;
            name?: string;
            name_servers?: string[];
            status?: string;
        };

        const listed = await cf<ZoneResult[]>(
            'GET',
            `/zones?name=${encodeURIComponent(name)}&account.id=${encodeURIComponent(accountId)}`,
        ).catch(() => [] as ZoneResult[]);

        const existing = listed.find((z) => (z.name ?? '').toLowerCase() === name);
        if (existing?.name_servers && existing.name_servers.length >= 2) {
            return { nameservers: existing.name_servers };
        }

        try {
            const created = await cf<ZoneResult>('POST', '/zones', {
                name,
                account: { id: accountId },
                jump_start: false,
                type: 'full',
            });
            const ns = created.name_servers ?? [];
            if (ns.length < 2) {
                throw new HostingError(
                    'Cloudflare did not return nameservers for the new zone.',
                    502,
                );
            }
            return { nameservers: ns };
        } catch (error) {
            // Zone already exists under this account — re-list.
            if (!(error instanceof HostingError)) throw error;
            const again = await cf<ZoneResult[]>(
                'GET',
                `/zones?name=${encodeURIComponent(name)}&account.id=${encodeURIComponent(accountId)}`,
            );
            const zone = again.find((z) => (z.name ?? '').toLowerCase() === name);
            if (!zone?.name_servers || zone.name_servers.length < 2) {
                throw error;
            }
            return { nameservers: zone.name_servers };
        }
    },
}; 