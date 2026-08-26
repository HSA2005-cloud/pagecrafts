import 'server-only';
import type { PublishFile } from '@/lib/contracts/deploy';
import type { DeployProvider, ProvisionInput, ProvisionResult } from '../provider';
import { deployConfig } from '../config';
import { toSlug, isReserved } from '../slug';
import { pollUntilLive } from '../verify';
import { cf, accountPath } from './cloudflare-client';
import { HostingError } from './hosting-error';
import { pushPagesDirectUpload } from './pages-direct-upload';

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
    },

    async verifyLive(url: string): Promise<boolean> {
        // Single short probe — publish marks live after push+DNS without long polling.
        return pollUntilLive(url, { timeoutMs: 2_000, intervalMs: 500 });
    },

    async removeSite(siteId: string): Promise<void> {
        await cf('DELETE', accountPath(`/pages/projects/${siteId}`));
    },
}; 