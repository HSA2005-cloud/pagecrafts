import { afterEach, describe, expect, it } from 'vitest';

import { jobStore, nextJobId, setJobStore } from '@/lib/ai/jobs/store';
import type { Job } from '@/lib/ai/jobs/types';

// "This site did not finish building" for a build that was, in fact, building.
//
// The job lived in a module-level Map. On Vercel the POST that starts a build runs in one
// function instance and keeps the job in that instance's memory; the browser's poll lands on
// whichever instance is free, which has never heard of it and answers 404. The editor reads
// that as failure while the build finishes somewhere else and is discarded.
//
// nextJobId had the same fault from the other side: a counter in module scope, restarting at
// zero in every cold instance, so production called nearly every build `job_1` — visible in
// the logs all evening — and two concurrent builds shared an id.

const job = (id: string, projectId = 'p_1'): Job => ({
    id,
    projectId,
    userId: 'u_1',
    prompt: 'a cafe in Bengaluru',
    status: 'queued',
    sectionsDone: 0,
    sectionsTotal: 0,
    startedAt: Date.now(),
    events: [],
    ledger: [],
});

afterEach(() => setJobStore(null));

describe('a job id is unique across instances', () => {
    it('never collides, over many ids', () => {
        const ids = new Set(Array.from({ length: 5_000 }, () => nextJobId()));

        expect(ids.size).toBe(5_000);
    });

    // The counter made this the id of almost every production build.
    it('is not a counter starting at one', () => {
        const ids = new Set(Array.from({ length: 100 }, () => nextJobId()));

        expect(ids.has('job_1')).toBe(false);
        expect(ids.has('job_2')).toBe(false);
    });

    it('keeps the prefix anything reading a log expects', () => {
        expect(nextJobId()).toMatch(/^job_[a-z0-9]+$/);
    });
});

describe('whatever store is in use keeps its side of the contract', () => {
    it('round-trips a job', async () => {
        const store = jobStore();
        const created = job(nextJobId());

        await store.create(created);

        expect((await store.get(created.id))?.id).toBe(created.id);
    });

    it('applies a patch without losing the rest', async () => {
        const store = jobStore();
        const created = job(nextJobId());
        await store.create(created);

        await store.update(created.id, { status: 'done', sectionsDone: 4 });
        const after = await store.get(created.id);

        expect(after?.status).toBe('done');
        expect(after?.sectionsDone).toBe(4);
        expect(after?.prompt).toBe(created.prompt);
    });

    // A poll for a job this instance has never seen must not read as a finished-and-empty
    // one, which is what turned a missing job into "did not finish building".
    it('answers undefined for a job it does not have', async () => {
        expect(await jobStore().get('job_nope')).toBeUndefined();
    });

    it('lists a project oldest first', async () => {
        const store = jobStore();
        const first = job(nextJobId(), 'p_list');
        const second = { ...job(nextJobId(), 'p_list'), startedAt: first.startedAt + 1_000 };

        await store.create(first);
        await store.create(second);
        const listed = await store.listByProject('p_list');

        expect(listed.map((j) => j.id)).toEqual([first.id, second.id]);
    });
});

describe('the store can still be swapped', () => {
    it('takes an injected store and gives it back', async () => {
        const injected = job('job_injected');
        setJobStore({
            create: async (j) => j,
            get: async () => injected,
            update: async () => injected,
            listByProject: async () => [injected],
        });

        expect((await jobStore().get('anything'))?.id).toBe('job_injected');
    });

    it('returns to a clean store when reset', async () => {
        const store = jobStore();
        const created = job(nextJobId());
        await store.create(created);

        setJobStore(null);

        expect(await jobStore().get(created.id)).toBeUndefined();
    });
});
