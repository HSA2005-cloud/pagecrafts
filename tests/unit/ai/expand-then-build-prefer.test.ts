import { afterEach, describe, expect, it } from 'vitest';

import { setGateway } from '@/lib/ai/gateway';
import { MockGateway } from '@/lib/ai/gateway/mock';
import { setProfileStore } from '@/lib/ai/profile-cache';
import { jobStore, setJobStore, nextJobId } from '@/lib/ai/jobs/store';
import { runJob } from '@/lib/ai/jobs/runner';
import type { CompleteReply, CompleteRequest, Gateway } from '@/lib/ai/gateway/provider';
import type { Job } from '@/lib/ai/jobs/types';

class TrackingGateway implements Gateway {
    name = 'mock' as const;
    prefers: Array<string | undefined> = [];
    systems: string[] = [];
    private inner = new MockGateway();

    async complete(req: CompleteRequest): Promise<CompleteReply> {
        this.prefers.push(req.prefer);
        this.systems.push(typeof req.system === 'string' ? req.system.slice(0, 80) : '');
        return this.inner.complete(req);
    }
}

async function queued(prompt: string): Promise<Job> {
    return jobStore().create({
        id: nextJobId(),
        projectId: 'p_expand',
        userId: 'u_expand',
        prompt,
        status: 'queued',
        sectionsDone: 0,
        sectionsTotal: 0,
        startedAt: Date.now(),
        events: [],
        ledger: [],
    });
}

afterEach(() => {
    setGateway(null);
    setJobStore(null);
    setProfileStore(null);
});

describe('Ask AI: Gemini expand then Groq build', () => {
    it('expands the short brief then builds with groq-prefer stages', async () => {
        const gw = new TrackingGateway();
        setGateway(gw);
        setJobStore(null);
        setProfileStore(null);

        const brief =
            'Business: Smile Dental. Place: Koramangala. Offer: family dental clinic, check-ups and braces. Tone: Simple.';
        const done = await runJob(await queued(brief));

        expect(done.status).toBe('done');
        expect(gw.prefers[0]).toBe('gemini');
        expect(gw.systems[0]).toMatch(/detailed build brief/i);

        const afterExpand = gw.prefers.slice(1);
        expect(afterExpand.length).toBeGreaterThan(0);
        expect(afterExpand.every((p) => p === 'groq')).toBe(true);

        // Job may trim events in the final snapshot — assert expand via the prompts + ledger.
        //
        // The expansion lives in buildPrompt. It used to be written over `prompt`, and that
        // is the field the jobs API and the editor show somebody as their own brief — tags,
        // "Expand that into a detailed build brief" and all.
        expect(done.prompt).toBe(brief);
        expect(done.buildPrompt).toBeDefined();
        expect(done.buildPrompt!.length).toBeGreaterThan(brief.length);
        expect(done.buildPrompt).toMatch(/marketing website|hero|services/i);
        expect(done.buildPrompt).toContain('Smile Dental');
        expect(done.files?.['index.html']).toMatch(/^<!doctype html>/i);
        expect(done.ledger.some((l) => l.stage === 'expand')).toBe(true);

        const expandEvent = done.events.find(
            (e) => e.name === 'plan' && (e.data as { mode?: string })?.mode === 'expand',
        );
        // Soft assert: events array may be compacted; ledger+prompt prove expand ran.
        if (!expandEvent) {
            expect(done.ledger.find((l) => l.stage === 'expand')).toBeTruthy();
        } else {
            expect((expandEvent.data as { expanded?: boolean }).expanded).toBe(true);
        }
    });
});
