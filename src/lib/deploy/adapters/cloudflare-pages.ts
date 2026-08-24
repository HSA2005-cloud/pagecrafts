import 'server-only';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PublishFile } from '@/lib/contracts/deploy';
import type { DeployProvider, ProvisionInput, ProvisionResult } from '../provider';
import { deployConfig } from '../config';
import { readDeployCredential } from '../credentials';
import { uniqueSlug } from '../slug';
import { pollUntilLive } from '../verify';
import { cf, accountPath } from './cloudflare-client';
import { HostingError } from './hosting-error';

const exec = promisify(execFile);

const WRANGLER = join(
    process.cwd(),
    'node_modules',
    'wrangler',
    'bin',
    'wrangler.js',
);

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
        const subdomain = await uniqueSlug(projectName, projectExists);

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
        const dir = await mkdtemp(join(tmpdir(), 'pagecraft-'));

        try {
            for (const file of files) {
                const target = join(dir, file.path);
                await mkdir(dirname(target), { recursive: true });
                await writeFile(
                    target,
                    file.encoding === 'base64'
                        ? Buffer.from(file.content, 'base64')
                        : file.content,
                );
            }

            const { stdout } = await exec(
                process.execPath,
                [
                    WRANGLER,
                    'pages',
                    'deploy',
                    dir,
                    '--project-name',
                    siteId,
                    '--branch',
                    'main',
                ],
                {
                    env: {
                        ...process.env,
                        CLOUDFLARE_API_TOKEN: readDeployCredential(),
                        CLOUDFLARE_ACCOUNT_ID: deployConfig().accountId,
                    },
                    maxBuffer: 10_000_000,
                },
            );

            const id = /https:\/\/([0-9a-f]{8})\./.exec(stdout)?.[1] ?? 'deployed';
            return { commitSha: id };
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },

    async enableHosting(siteId: string): Promise<void> {
        const domain = `${siteId}.${deployConfig().rootDomain}`;

        // Step one: tell Pages to serve this hostname.
        try {
            await cf('POST', accountPath(`/pages/projects/${siteId}/domains`), {
                name: domain,
            });
        } catch (error) {
            if (!(error instanceof HostingError && error.status === 409)) throw error;
        }

        // Step two, and it was missing: make the hostname resolve.
        //
        // Attaching a custom domain to a Pages project does not create a DNS record. The
        // dashboard offers to -- that is the "Complete DNS setup" button -- but the API
        // does not, and nothing in the response says so. The project shows the domain
        // attached and sits in "Verifying" forever.
        //
        // The effect was that every publish reported success and no site was ever reachable:
        // provision, upload and hosting all returned ok, verification quietly ran out its
        // ninety seconds, and the address answered NXDOMAIN. Found on D20 by opening one.
        //
        // Proxied, because a Pages custom domain requires the record to go through
        // Cloudflare rather than resolve straight to the origin.
        try {
            await cf('POST', `/zones/${await zoneId()}/dns_records`, {
                type: 'CNAME',
                name: siteId,
                content: `${siteId}.pages.dev`,
                proxied: true,
                comment: 'PageCraft published site',
            });
        } catch (error) {
            // 400 is what a duplicate record answers with. A republish must not fall over
            // because the address it is already serving on is already pointed at it.
            if (!(error instanceof HostingError && error.status === 400)) throw error;
        }
    },

    async verifyLive(url: string): Promise<boolean> {
        return pollUntilLive(url);
    },

    async removeSite(siteId: string): Promise<void> {
        await cf('DELETE', accountPath(`/pages/projects/${siteId}`));
    },
}; 