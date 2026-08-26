import type { Job, JobStore } from './types';
import { redisJobStoreOrNull } from './redis-store';

/** In-memory until the jobs table lands on D9; swapping it is this one file. */
class MemoryJobStore implements JobStore {
    private readonly jobs = new Map<string, Job>();

    async create(job: Job): Promise<Job> {
        this.jobs.set(job.id, job);
        return job;
    }

    async get(id: string): Promise<Job | undefined> {
        return this.jobs.get(id);
    }

    async update(id: string, patch: Partial<Job>): Promise<Job | undefined> {
        const current = this.jobs.get(id);
        if (!current) return undefined;
        const next = { ...current, ...patch };
        this.jobs.set(id, next);
        return next;
    }

    async listByProject(projectId: string): Promise<Job[]> {
        return [...this.jobs.values()]
            .filter((job) => job.projectId === projectId)
            .sort((a, b) => a.startedAt - b.startedAt);
    }
}

let instance: JobStore | null = null;
let override: JobStore | null = null;

/**
 * Redis where it is configured, memory where it is not.
 *
 * Memory is correct on one long-lived process and wrong on Vercel, where the request that
 * creates a job and the poll that reads it land on different function instances. Resolved
 * lazily so a test can call setJobStore before anything touches Redis.
 */
export function jobStore(): JobStore {
    if (override) return override;
    if (instance) return instance;

    instance = redisJobStoreOrNull() ?? new MemoryJobStore();

    return instance;
}

export function setJobStore(next: JobStore | null): void {
    override = next;
    if (!next) instance = null;
}

/**
 * A job id that is unique across instances.
 *
 * This was a counter in module scope, which restarts at zero in every cold serverless
 * instance — so production called almost every build `job_1`, and two builds running at once
 * shared an id and overwrote each other.
 */
export function nextJobId(): string {
    const random = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : Math.random().toString(36).slice(2, 14);

    return `job_${Date.now().toString(36)}${random}`;
}
