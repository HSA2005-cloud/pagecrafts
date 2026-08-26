import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { checkEditPermission } from "@/lib/data/entitlements";
import { EDIT_UNLOCK_PRICE_INR } from "@/lib/payments/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

// GET /api/v1/projects/{id}/edit-access — may the owner still edit this site?
export const GET = withRoute<undefined, Params>({
  auth: "required",
  handler: async ({ supabase, params, userId }) => {
    const permission = await checkEditPermission(supabase, userId, params.id);
    return ok({
      allowed: permission.allowed,
      reason: permission.reason,
      unlockPriceInr: EDIT_UNLOCK_PRICE_INR,
    });
  },
});
