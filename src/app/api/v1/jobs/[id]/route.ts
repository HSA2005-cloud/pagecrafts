import 'server-only';

import { withRoute } from '@/lib/kernel/with-route';
import { ok, ApiError } from '@/lib/errors/respond';
import { jobStore } from '@/lib/ai/jobs/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

// GET /api/v1/jobs/{id} — poll for progress. SSE is the richer path; this one
// works everywhere and is the fallback when a proxy blocks streaming.
export const GET = withRoute<undefined, Params>({
    auth: 'required',
    handler: async ({ params, userId }) => {
        const job = await jobStore().get(params.id);

        // Another user's job is not_found, never forbidden — its existence is not ours to leak.
        if (!job || job.userId !== userId) {
            throw new ApiError('not_found', 'No such job.');
        }

        return ok({
            status: job.status,
            sections_done: job.sectionsDone,
            sections_total: job.sectionsTotal,
            provider: job.provider,
            elapsed_ms: (job.endedAt ?? Date.now()) - job.startedAt,
            ...(job.fallbackTemplateId ? { fallback_template_id: job.fallbackTemplateId } : {}),
            ...(job.error ? { error: job.error } : {}),
            files_ready: Boolean(job.files && Object.keys(job.files).length),
        });
    },
});
