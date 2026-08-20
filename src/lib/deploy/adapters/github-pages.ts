import 'server-only';
import type { PublishFile } from '@/lib/contracts/deploy';
import type { DeployProvider, ProvisionInput, ProvisionResult } from '../provider';
import { deployConfig } from '../config';
import { uniqueSlug } from '../slug';
import { pushAsSingleCommit } from '../git-data';
import { pollUntilLive } from '../verify';
import { gh, HostingError } from './github-client';
import { gitDataFor } from './github-git-data';

const org = () => process.env.GITHUB_ORG ?? deployConfig().accountId;

async function repoExists(name: string): Promise<boolean> {
    try {
        await gh('GET', `/repos/${org()}/${name}`);
        return true;
    } catch (error) {
        if (error instanceof HostingError && error.status === 404) return false;
        throw error;
    }
}

export const githubPagesAdapter: DeployProvider = {
    async provisionSite({ projectId, projectName }: ProvisionInput): Promise<ProvisionResult> {
        const subdomain = await uniqueSlug(projectName, repoExists);

        await gh('POST', `/orgs/${org()}/repos`, {
            name: subdomain,
            description: `PageCrafts site ${projectId}`,
            auto_init: true,
            private: false,
        });

        return {
            siteId: `${org()}/${subdomain}`,
            subdomain,
            predictedUrl: `https://${subdomain}.${deployConfig().rootDomain}`,
        };
    },

    // A GitHub site id is `org/repo`; the repo name is the subdomain.
    addressFor(siteId: string) {
        const subdomain = siteId.split('/').pop() ?? siteId;
        return {
            subdomain,
            url: `https://${subdomain}.${deployConfig().rootDomain}`,
        };
    },

    async pushBuild(siteId: string, files: PublishFile[], message: string) {
        const [owner, repo] = siteId.split('/');
        const domain = `${repo}.${deployConfig().rootDomain}`;
        const reserved = new Set(['CNAME', '.nojekyll']);

        const withDomain: PublishFile[] = [
            ...files.filter((f) => !reserved.has(f.path)),
            { path: 'CNAME', content: `${domain}\n`, encoding: 'utf-8' },
            { path: '.nojekyll', content: '', encoding: 'utf-8' },
        ];

        const { commitSha } = await pushAsSingleCommit(
            gitDataFor(owner, repo),
            withDomain,
            message,
        );

        return { commitSha };
    },

    async enableHosting(siteId: string): Promise<void> {
        const [owner, repo] = siteId.split('/');
        const domain = `${repo}.${deployConfig().rootDomain}`;

        await gh('POST', `/repos/${owner}/${repo}/pages`, {
            source: { branch: 'main', path: '/' },
        });

        try {
            await gh('PUT', `/repos/${owner}/${repo}/pages`, {
                cname: domain,
                https_enforced: true,
            });
        } catch {
            // certificate not issued yet; verification retries this
        }
    },

    async verifyLive(url: string): Promise<boolean> {
        return pollUntilLive(url);
    },

    async removeSite(siteId: string): Promise<void> {
        const [owner, repo] = siteId.split('/');
        await gh('DELETE', `/repos/${owner}/${repo}`);
    },
};