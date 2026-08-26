import { describe, it, expect, vi } from 'vitest';
import { publish } from '@/lib/deploy/publish';
import type { DeployProvider } from '@/lib/deploy/provider';

function fakeProvider(): DeployProvider {
    return {
        provisionSite: async () => ({
            siteId: 'pagecraft-sites/spike',
            subdomain: 'spike',
            predictedUrl: 'https://spike.pagecrafts.in',
        }),
        addressFor: (siteId: string) => {
            const subdomain = siteId.split('/').pop() ?? siteId;
            return { subdomain, url: `https://${subdomain}.pagecrafts.in` };
        },
        pushBuild: async () => ({ commitSha: 'commit-1' }),
        enableHosting: async () => { },
        verifyLive: async () => true,
        removeSite: async () => { },
        attachCustomDomain: async (_siteId, hostname) => ({
            hostname,
            target: 'spike.pages.dev',
            records: [],
        }),
        domainStatus: async () => 'pending' as const,
        ensureDnsZone: async () => ({ nameservers: ['ns1.example.net', 'ns2.example.net'] }),
    };
}

const input = {
    projectId: 'p1',
    projectName: 'Spike',
    files: [{ path: 'index.html', content: '<h1>hi</h1>', encoding: 'utf-8' as const }],
};

describe('publish', () => {
    it('walks the stages in order and returns a live url', async () => {
        const states: string[] = [];
        const result = await publish(
            { ...input, idempotencyKey: 'k1' },
            (s) => states.push(s),
            fakeProvider(),
        );

        expect(states).toEqual([
            'pending',
            'provisioning',
            'pushing',
            'enabling_hosting',
            'live',
        ]);
        expect(result.state).toBe('live');
        expect(result.liveUrl).toBe('https://spike.pagecrafts.in');
        expect(result.commitSha).toBe('commit-1');
    });

    it('marks live after push + hosting without a second origin wait', async () => {
        // verifyLive is unused on the happy path — pushBuild already confirmed Pages.
        const provider = fakeProvider();
        const verify = vi.spyOn(provider, 'verifyLive');

        const result = await publish(
            { ...input, idempotencyKey: 'k2' },
            () => { },
            provider,
        );

        expect(result.state).toBe('live');
        expect(result.liveUrl).toBe('https://spike.pagecrafts.in');
        expect(verify).not.toHaveBeenCalled();
    });

    it('still attaches hosting when republishing', async () => {
        // siteId is remembered even after a failed first push; skipping enableHosting
        // left orphan Pages projects with no DNS (522 / NXDOMAIN).
        const provider = fakeProvider();
        const enable = vi.spyOn(provider, 'enableHosting');

        await publish(
            { ...input, siteId: 'pagecraft-sites/spike', idempotencyKey: 'k3' },
            () => { },
            provider,
        );

        expect(enable).toHaveBeenCalledOnce();
    });
});
