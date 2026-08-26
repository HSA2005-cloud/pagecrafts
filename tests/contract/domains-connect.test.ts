import { beforeEach, describe, expect, it, vi } from 'vitest';

import { connectDomain, listDomains, verifyDomain } from '@/lib/data/domains';
import type { DeployProvider } from '@/lib/deploy/provider';
import { createFakeDb } from '../support/fake-db';

const OWNER = '11111111-1111-1111-1111-111111111111';

function mockProvider(overrides: Partial<DeployProvider> = {}): DeployProvider {
    return {
        async provisionSite() {
            return { siteId: 'demo', subdomain: 'demo', predictedUrl: 'https://demo.pagecrafts.in' };
        },
        addressFor(siteId) {
            return { subdomain: siteId, url: `https://${siteId}.pagecrafts.in` };
        },
        async pushBuild() {
            return { commitSha: 'abc1234' };
        },
        async enableHosting() {},
        async verifyLive() {
            return true;
        },
        async removeSite() {},
        async attachCustomDomain(_siteId, hostname) {
            return {
                hostname,
                target: 'demo.pages.dev',
                records: [{ type: 'CNAME', host: hostname, value: 'demo.pages.dev' }],
            };
        },
        async domainStatus() {
            return 'pending';
        },
        async ensureDnsZone() {
            return { nameservers: ['ns1.example.net', 'ns2.example.net'] };
        },
        ...overrides,
    };
}

describe('connect domain', () => {
    beforeEach(() => {
        vi.stubEnv('ROOT_DOMAIN', 'pagecrafts.in');
    });

    it('refuses before the project has a live site id', async () => {
        const db = createFakeDb({ users: [{ id: OWNER }] });
        const project = db.insert('projects', {
            user_id: OWNER,
            name: 'Cafe',
            content_json: {},
            repo_full_name: null,
        });

        await expect(
            connectDomain(db.asUser(OWNER), OWNER, project.id as string, 'cafe.in', mockProvider()),
        ).rejects.toMatchObject({ code: 'validation_failed' });
    });

    it('attaches then lands on pending_dns with DNS records', async () => {
        const db = createFakeDb({ users: [{ id: OWNER }] });
        const project = db.insert('projects', {
            user_id: OWNER,
            name: 'Cafe',
            content_json: {},
            repo_full_name: 'demo',
        });

        const domain = await connectDomain(
            db.asUser(OWNER),
            OWNER,
            project.id as string,
            'https://Cafe.IN/',
            mockProvider(),
        );

        expect(domain.name).toBe('cafe.in');
        expect(domain.status).toBe('pending_dns');
        expect(domain.records).toEqual([
            { type: 'CNAME', host: 'cafe.in', value: 'demo.pages.dev' },
        ]);

        const listed = await listDomains(db.asUser(OWNER), project.id as string);
        expect(listed).toHaveLength(1);
        expect(listed[0]!.status).toBe('pending_dns');
    });

    it('marks failed when the host rejects attach', async () => {
        const db = createFakeDb({ users: [{ id: OWNER }] });
        const project = db.insert('projects', {
            user_id: OWNER,
            name: 'Cafe',
            content_json: {},
            repo_full_name: 'demo',
        });

        await expect(
            connectDomain(
                db.asUser(OWNER),
                OWNER,
                project.id as string,
                'broken.in',
                mockProvider({
                    async attachCustomDomain() {
                        throw new Error('Host refused the hostname.');
                    },
                }),
            ),
        ).rejects.toMatchObject({ code: 'hosting_error' });

        const listed = await listDomains(db.asUser(OWNER), project.id as string);
        expect(listed[0]!.status).toBe('failed');
    });
});

describe('verify domain', () => {
    it('flips to live when the host reports active', async () => {
        const db = createFakeDb({ users: [{ id: OWNER }] });
        const project = db.insert('projects', {
            user_id: OWNER,
            name: 'Cafe',
            content_json: {},
            repo_full_name: 'demo',
        });
        db.insert('deployments', {
            project_id: project.id,
            status: 'live',
            live_url: 'https://demo.pagecrafts.in',
        });

        const connected = await connectDomain(
            db.asUser(OWNER),
            OWNER,
            project.id as string,
            'cafe.in',
            mockProvider(),
        );

        const verified = await verifyDomain(
            db.asUser(OWNER),
            OWNER,
            project.id as string,
            connected.id,
            mockProvider({
                async domainStatus() {
                    return 'active';
                },
            }),
        );

        expect(verified.status).toBe('live');
        const deployment = db.rows('deployments')[0]!;
        expect(deployment.live_url).toBe('https://cafe.in');
    });

    it('stays pending when DNS is not ready', async () => {
        const db = createFakeDb({ users: [{ id: OWNER }] });
        const project = db.insert('projects', {
            user_id: OWNER,
            name: 'Cafe',
            content_json: {},
            repo_full_name: 'demo',
        });

        const connected = await connectDomain(
            db.asUser(OWNER),
            OWNER,
            project.id as string,
            'cafe.in',
            mockProvider(),
        );

        const verified = await verifyDomain(
            db.asUser(OWNER),
            OWNER,
            project.id as string,
            connected.id,
            mockProvider({
                async domainStatus() {
                    return 'pending';
                },
            }),
        );

        expect(verified.status).toBe('pending_dns');
    });

    it('marks failed when the host reports failure', async () => {
        const db = createFakeDb({ users: [{ id: OWNER }] });
        const project = db.insert('projects', {
            user_id: OWNER,
            name: 'Cafe',
            content_json: {},
            repo_full_name: 'demo',
        });

        const connected = await connectDomain(
            db.asUser(OWNER),
            OWNER,
            project.id as string,
            'cafe.in',
            mockProvider(),
        );

        const verified = await verifyDomain(
            db.asUser(OWNER),
            OWNER,
            project.id as string,
            connected.id,
            mockProvider({
                async domainStatus() {
                    return 'failed';
                },
            }),
        );

        expect(verified.status).toBe('failed');
        expect(verified.failureReason).toMatch(/verify/i);
    });
});
