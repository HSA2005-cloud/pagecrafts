import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createFakeDb } from '../support/fake-db';

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
const persisted = vi.hoisted(() => ({ ledger: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
    requireUser: auth.requireUser,
    supabaseRoute: async () => ({}),
}));
vi.mock('@/lib/ai/cost/persist', () => ({
    persistLedger: persisted.ledger,
}));

vi.mock('@/lib/limits/redis', async () => {
    const support = await import('../support/redis-mock');
    return { redis: () => support.redisStub, isRedisConfigured: () => false };
});

import { redisMock as limits, resetRedisMock } from '../support/redis-mock';
import { setGateway, type Gateway } from '@/lib/ai/gateway';
import { MockGateway } from '@/lib/ai/gateway/mock';
import { jobStore, setJobStore } from '@/lib/ai/jobs/store';
import { setGenerationCounters } from '@/lib/ai/jobs/budget';
import { resetDiversityStore } from '@/lib/ai/composition/diversity';
import { POST as GENERATE } from '@/app/api/v1/projects/[id]/generate/route';
import { GET as STREAM } from '@/app/api/v1/jobs/[id]/stream/route';
import { POST as EDITS } from '@/app/api/v1/projects/[id]/edits/route';

const generate = (prompt: string) =>
    GENERATE(
        new Request('http://x/g', {
            method: 'POST', body: JSON.stringify({ prompt }),
            headers: { 'content-type': 'application/json' },
        }) as never,
        { params: Promise.resolve({ id: 'p_1' }) } as never,
    );

/** Clear enough that the clarity gate does not refuse before the job starts. */
const CLEAR_PROMPT = 'a dental clinic for family check-ups in Koramangala';

const stream = (id: string) =>
    STREAM(
        new Request(`http://x/api/v1/jobs/${id}/stream`) as never,
        { params: Promise.resolve({ id }) } as never,
    );

const edit = (body: unknown) =>
    EDITS(
        new Request('http://x/e', {
            method: 'POST', body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
        }) as never,
        { params: Promise.resolve({ id: 'p_1' }) } as never,
    );

async function settled(id: string) {
    for (let i = 0; i < 200; i++) {
        const job = await jobStore().get(id);
        if (job && (job.status === 'done' || job.status === 'failed')) return job;
        await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('job did not settle');
}

// The generate route reads the project through RLS before it starts anything, so a session
// in these tests needs a client that can see one. Backed by the same fake database the
// persistence tests use rather than a bespoke stub: these specs also exercise /edits and
// the look-picker, and those reach for query shapes a hand-rolled builder does not have.
//
// What each test is about is generation, not ownership — /generate refusing somebody else's
// project is covered on its own in generate-ownership.test.ts.
function sessionFor(userId: string) {
    const db = createFakeDb({ users: [{ id: userId }] });
    db.insert('projects', { id: 'p_1', user_id: userId, name: 'Test site', content_json: {}, site_meta: {} });
    return { userId, supabase: db.asUser(userId) };
}

beforeEach(() => {
    auth.requireUser.mockResolvedValue(sessionFor('u_1'));
    persisted.ledger.mockReset().mockResolvedValue(undefined);
    resetRedisMock();
    limits.evalMock.mockImplementation(async (_s: string, keys: string[]) =>
        keys[0]?.startsWith('cc:') ? 1 : [1, 19, 0]);
    setJobStore(null);
    setGenerationCounters(null);
    resetDiversityStore();
    setGateway(new MockGateway());
});

afterEach(() => {
    setGateway(null);
    vi.clearAllMocks();
});

describe('GET /api/v1/jobs/{id}/stream', () => {
    it('R10: emits plan, section, validate and done in order', async () => {
        const { data } = await (await generate(CLEAR_PROMPT)).json();
        await settled(data.job_id);

        const res = await stream(data.job_id);
        expect(res.headers.get('content-type')).toContain('text/event-stream');

        const body = await res.text();
        const events = [...body.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);

        expect(events[0]).toBe('plan');
        expect(events).toContain('section');
        expect(events.at(-1)).toBe('done');
        expect(events.indexOf('validate')).toBeGreaterThan(events.lastIndexOf('section'));
    });

    it('R11: emits fallback when generation is abandoned', async () => {
        setGateway(new MockGateway('error'));
        const { data } = await (await generate(CLEAR_PROMPT)).json();
        await settled(data.job_id);

        const body = await (await stream(data.job_id)).text();
        expect(body).toContain('event: fallback');
    });

    it('another user\'s job is not_found', async () => {
        const { data } = await (await generate(CLEAR_PROMPT)).json();
        auth.requireUser.mockResolvedValue(sessionFor('u_2'));
        expect((await stream(data.job_id)).status).toBe(404);
    });
});

describe('POST /api/v1/projects/{id}/edits', () => {
    const section = {
        id: 's_01', type: 'hero', variant: 'centred',
        brief: 'welcome', props: { heading: 'Old heading' },
    };

    function fake(reply: string): Gateway {
        return {
            async complete() {
                return {
                    provider: 'groq' as const, text: reply, model: 'm',
                    inputTokens: 1, outputTokens: 1, latencyMs: 1,
                };
            },
        };
    }

    it('R13: returns a diff and writes nothing', async () => {
        setGateway(fake(JSON.stringify({
            changes: { heading: 'New heading' },
            explanation: 'Punchier.',
        })));

        const res = await edit({ instruction: 'make it punchier', section });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.data.applied).toBe(false);
        expect(json.data.patch).toEqual([
            { op: 'replace', path: '/props/heading', value: 'New heading' },
        ]);
        expect(json.data).toHaveProperty('pre_commit_sha');
        expect(persisted.ledger).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ userId: 'u_1', projectId: 'p_1' }),
            [expect.objectContaining({ stage: 'edit', provider: 'groq' })],
        );
        expect(limits.hincrbyMock).toHaveBeenCalled();
    });

    it('R14: sanitises the proposal before returning it', async () => {
        setGateway(fake(JSON.stringify({
            changes: { heading: 'Hi<script>alert(1)</script>' },
            explanation: 'Done <script>steal()</script>',
        })));

        const json = await (await edit({ instruction: 'x', section })).json();
        expect(JSON.stringify(json.data)).not.toContain('<script');
    });

    it('rejects an unknown section type', async () => {
        const res = await edit({ instruction: 'x', section: { ...section, type: 'vibes' } });
        expect(res.status).toBe(422);
    });

    it('rejects an empty instruction', async () => {
        const res = await edit({ instruction: '', section });
        expect(res.status).toBe(422);
    });
});
