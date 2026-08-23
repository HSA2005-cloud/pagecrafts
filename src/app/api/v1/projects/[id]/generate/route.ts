import 'server-only';

import { z } from 'zod';
import { withRoute } from '@/lib/kernel/with-route';
import { ok, ApiError } from '@/lib/errors/respond';
import { MAX_CLASSIFY_CHARS } from '@/lib/contracts';
import { jobStore, nextJobId } from '@/lib/ai/jobs/store';
import { runJob } from '@/lib/ai/jobs/runner';
import { checkGenerationBudget, setGenerationCounters } from '@/lib/ai/jobs/budget';
import { supabaseCounters, recordGenerationDispatch } from '@/lib/ai/jobs/supabase-counters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Wire the real, database-backed budget counters in place of the permissive stub. Tests reset
// the counters in beforeEach, so this only takes effect for the running application.
setGenerationCounters(supabaseCounters);

type Params = { id: string };

const schema = z.object({ prompt: z.string().min(1).max(MAX_CLASSIFY_CHARS) });

// POST /api/v1/projects/{id}/generate — 202 with a job id; the work runs after.
export const POST = withRoute<z.infer<typeof schema>, Params>({
    auth: 'required',
    limit: 'ai',
    schema,
    handler: async ({ body, params, userId, supabase }) => {
        const budget = await checkGenerationBudget(userId, params.id, body.prompt);
        if (!budget.ok) throw new ApiError(budget.code, budget.message);

        // Record the dispatch so the Starter per-site cap can count it (best-effort; never
        // blocks the generation the user asked for). Pro/Premium are not capped, but the row
        // is still written for usage history.
        await recordGenerationDispatch(supabase, userId, params.id, body.prompt);

        const job = await jobStore().create({
            id: nextJobId(),
            projectId: params.id,
            userId,
            prompt: body.prompt,
            status: 'queued',
            sectionsDone: 0,
            sectionsTotal: 0,
            startedAt: Date.now(),
            events: [],
            ledger: [],
        });

        // Not awaited: the caller polls GET /jobs/{id} rather than holding the request
        // open for the ~40s a generation takes.
        void runJob(job).catch((err) => console.error('[generate]', err));

        return ok({ job_id: job.id }, 202);
    },
});
