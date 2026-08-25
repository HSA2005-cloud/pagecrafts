import 'server-only';

import type { DeploymentResponse, DeploymentState } from '@/lib/contracts';
import { withRoute } from '@/lib/kernel/with-route';
import { ok, ApiError } from '@/lib/errors/respond';
import { getDeployment, type DeploymentView } from '@/lib/data/deployments';
import { resumeVerification } from '@/lib/data/publish-project';
import { failureLine } from '@/lib/deploy/failure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

// The database tracks seven states so the dashboard can narrate progress; the contract
// exposes three, because a caller polling for an answer only needs "not yet", "done" or
// "it failed". Everything in between is still "not yet".
function reportedStatus(state: DeploymentState): DeploymentResponse['status'] {
    if (state === 'live') return 'live';
    if (state === 'failed') return 'failed';
    return 'pending';
}

function toResponse(deployment: DeploymentView): DeploymentResponse {
    return {
        status: reportedStatus(deployment.state),
        repoUrl: deployment.repoUrl,
        // C-05: only a deployment that reached live has a URL worth giving anyone. The
        // column can hold one earlier — a resumed attempt writes it at the same moment it
        // writes the state — and reading it unconditionally would hand out a link to a site
        // that is not answering yet.
        liveUrl: deployment.state === 'live' ? deployment.liveUrl : null,
        commitSha: deployment.commitSha,
        // Owner-facing words only. `deployment.error` is the redacted provider detail for
        // support — leaking it here is how "Deploy credential is not configured" reached
        // the Go Live dialog (R3 D18).
        error:
            deployment.state === 'failed'
                ? deployment.error &&
                  /taken|reserved|Choose another/i.test(deployment.error)
                    ? deployment.error
                    : failureLine(deployment.failureReason)
                : null,
    };
}

// GET /api/v1/deployments/{id} — poll a publish attempt.
export const GET = withRoute<undefined, Params>({
    auth: 'required',
    handler: async ({ params, supabase }) => {
        const deployment = await getDeployment(supabase, params.id);

        // Another account's deployment is not_found, never forbidden — the same rule the
        // jobs route follows. "Forbidden" would confirm the id is real to someone guessing.
        if (!deployment) {
            throw new ApiError('not_found', 'No such deployment.');
        }

        // An attempt resting in `verifying` did everything except get an answer from the
        // host. The client is already polling this route waiting for exactly that, so the
        // poll is where the re-check belongs — no scheduler, no worker, and no site left
        // sitting one DNS refresh short of live because nothing came back to look (R3 D17).
        //
        // Re-checking costs one request and provisions nothing, so a client polling every
        // two seconds is not doing anything expensive. A failure inside it leaves the row
        // untouched and is not the poll's problem to report.
        if (deployment.state === 'verifying') {
            const state = await resumeVerification(supabase, params.id).catch(
                () => deployment.state,
            );
            if (state === 'live') {
                const settled = await getDeployment(supabase, params.id);
                if (settled) return ok<DeploymentResponse>(toResponse(settled));
            }
        }

        return ok<DeploymentResponse>(toResponse(deployment));
    },
});
