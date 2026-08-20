import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { setGateway } from '@/lib/ai/gateway';
import { MockGateway } from '@/lib/ai/gateway/mock';
import { setProfileStore } from '@/lib/ai/profile-cache';
import { jobStore, setJobStore, nextJobId } from '@/lib/ai/jobs/store';
import { runJob } from '@/lib/ai/jobs/runner';
import type { Job } from '@/lib/ai/jobs/types';

async function queued(prompt: string): Promise<Job> {
    return jobStore().create({
        id: nextJobId(),
        projectId: 'p_edit',
        userId: 'u_edit',
        prompt,
        status: 'queued',
        sectionsDone: 0,
        sectionsTotal: 0,
        startedAt: Date.now(),
        events: [],
        ledger: [],
    });
}

beforeEach(() => {
    setGateway(new MockGateway());
    setJobStore(null);
    setProfileStore(null);
});

afterEach(() => {
    setGateway(null);
    setJobStore(null);
    setProfileStore(null);
});

describe('opening a generated site without a plan picker', () => {
    it('persists the default look before the job is marked done', async () => {
        const persisted: Job[] = [];
        const statuses: Job['status'][] = [];

        const done = await runJob(await queued('a family dental clinic in koramangala'), {
            persistSite: async (settled) => {
                statuses.push((await jobStore().get(settled.id))?.status ?? 'queued');
                persisted.push(settled);
            },
        });

        expect(done.status).toBe('done');
        expect(persisted).toHaveLength(1);
        expect(statuses[0]).not.toBe('done');
        expect(persisted[0].files?.['index.html']).toMatch(/^<!doctype html>/i);
        expect(persisted[0].composition).toBeDefined();
    });
});
