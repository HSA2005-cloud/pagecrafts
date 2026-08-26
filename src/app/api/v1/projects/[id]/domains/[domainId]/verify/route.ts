import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { verifyDomain } from "@/lib/data/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string; domainId: string };

// POST /api/v1/projects/{id}/domains/{domainId}/verify — re-check host DNS status.
export const POST = withRoute<undefined, Params>({
  auth: "required",
  handler: async ({ supabase, params, userId }) =>
    ok(await verifyDomain(supabase, userId, params.id, params.domainId)),
});
