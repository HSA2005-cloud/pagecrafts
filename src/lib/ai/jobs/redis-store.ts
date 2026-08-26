import 'server-only';

import { isRedisConfigured, redis } from '@/lib/limits/redis';
import type { Job, JobStore } from './types';

/**
 * A job that survives the request that created it.
 *
 * The in-memory store held every job in a module-level Map. That works on one long-lived
 * server and cannot work on Vercel: the POST that starts a build runs in one function
 * instance and keeps the job in that instance's memory, while the browser's poll for it
 * lands on whichever instance is free. That one answers 404, the editor reads "the site did
 * not finish building", and the build it is asking about is meanwhile finishing somewhere
 * else and being thrown away.
 *
 * `nextJobId` had the same shape of fault: a module-level counter, restarting at zero in
 * every cold instance, so every build in production was called `job_1` and two of them could
 * not be told apart.
 *
 * Jobs are short-lived and written often, so they live in Redis with a TTL rather than in
 * Postgres. Nothing here is the record of what was built — that is the project's files, and
 * persistSite writes them.
 */

const KEY = (id: string) => `job:${id}`;
const PROJECT_KEY = (projectId: string) => `job:project:${projectId}`;

/** Long enough for a slow build and the poll that follows it; short enough to forget. */
const TTL_SECONDS = 60 * 60;

/** Most recent jobs kept per project. A project's history is the commits, not this. */
const PER_PROJECT = 20;

export class RedisJobStore implements JobStore {
    async create(job: Job): Promise<Job> {
        const client = redis();

        await client.set(KEY(job.id), JSON.stringify(job), { ex: TTL_SECONDS });
        await client.lpush(PROJECT_KEY(job.projectId), job.id);
        await client.ltrim(PROJECT_KEY(job.projectId), 0, PER_PROJECT - 1);
        await client.expire(PROJECT_KEY(job.projectId), TTL_SECONDS);

        return job;
    }

    async get(id: string): Promise<Job | undefined> {
        const raw = await redis().get<string | Job>(KEY(id));
        if (!raw) return undefined;

        // The Upstash client parses JSON responses for you, so a round-tripped object may
        // arrive already decoded. Accept both rather than assuming one.
        if (typeof raw !== 'string') return raw;

        try {
            return JSON.parse(raw) as Job;
        } catch {
            return undefined;
        }
    }

    async update(id: string, patch: Partial<Job>): Promise<Job | undefined> {
        const current = await this.get(id);
        if (!current) return undefined;

        const next = { ...current, ...patch };
        await redis().set(KEY(id), JSON.stringify(next), { ex: TTL_SECONDS });

        return next;
    }

    async listByProject(projectId: string): Promise<Job[]> {
        const ids = await redis().lrange<string>(PROJECT_KEY(projectId), 0, PER_PROJECT - 1);
        if (!ids?.length) return [];

        const jobs = await Promise.all(ids.map((id) => this.get(id)));

        return jobs
            .filter((job): job is Job => Boolean(job))
            .sort((a, b) => a.startedAt - b.startedAt);
    }
}

/**
 * Redis when it is configured, and nothing otherwise.
 *
 * Returning null rather than throwing lets the caller keep the in-memory store for tests and
 * for a local machine with no Upstash credentials, where one process serves every request
 * and memory is a correct implementation.
 */
export function redisJobStoreOrNull(): JobStore | null {
    if (!isRedisConfigured()) return null;

    try {
        return new RedisJobStore();
    } catch {
        return null;
    }
}
