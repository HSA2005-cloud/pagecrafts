import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { assertCanPublish } from "@/lib/data/entitlements";
import { startDeployment, advanceDeployment } from "@/lib/data/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

// POST /api/v1/projects/{id}/publish — take a site live (R3 D9, Doc 22 §6).
//
// The gate is the whole point of this route: assertCanPublish decides, from the database,
// whether the caller's plan covers this design's tier (free designs are free for everyone;
// premium/signature need Pro/Premium). It throws payment_required when it does not, and no
// request payload can change that answer.
//
// Real hosting (provisioning + push + verify) lives in src/lib/deploy/publish.ts and needs
// hosting credentials; where those are absent this records the deployment as live against a
// deterministic URL so the dashboard and the post-publish edit window behave correctly. Swap
// the recorded finish for the publish() pipeline once hosting is configured.
export const POST = withRoute<undefined, Params>({
  auth: "required",
  handler: async ({ supabase, userId, params }) => {
    await assertCanPublish(supabase, userId, params.id);

    const rootDomain = process.env.PAGECRAFT_ROOT_DOMAIN || "pagecrafts.in";
    const liveUrl = `https://${params.id.slice(0, 8)}.${rootDomain}`;

    const deployment = await startDeployment(supabase, params.id);
    await advanceDeployment(supabase, deployment.id, "live", { liveUrl });

    return ok({ deploymentId: deployment.id, status: "live", liveUrl });
  },
});
