import 'server-only';

import { withRoute } from '@/lib/kernel/with-route';
import { ok, ApiError } from '@/lib/errors/respond';
import { publishProject } from '@/lib/data/publish-project';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Direct Upload + DNS finish in-request; keep headroom under one minute typical. */
export const maxDuration = 120;

type Params = { id: string };

const MAX_KEY_LENGTH = 255;

// POST /api/v1/projects/{id}/publish — awaits host work, returns final status.
export const POST = withRoute<undefined, Params>({
    auth: 'required',
    handler: async ({ params, userId, req, supabase }) => {
        const idempotencyKey = req.headers.get('idempotency-key')?.trim();

        if (!idempotencyKey) {
            throw new ApiError(
                'validation_failed',
                'This request needs an Idempotency-Key header so a retry cannot publish twice.',
            );
        }

        if (idempotencyKey.length > MAX_KEY_LENGTH) {
            throw new ApiError(
                'validation_failed',
                `That Idempotency-Key is too long — it must be ${MAX_KEY_LENGTH} characters or fewer.`,
            );
        }

        const body = await publishProject(supabase, userId, params.id, idempotencyKey);
        return ok(
            {
                deploymentId: body.deploymentId,
                status: body.status,
                liveUrl: body.liveUrl,
                error: body.error,
            },
            body.status === 'pending' ? 202 : 200,
        );
    },
});
