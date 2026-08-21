import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { getBilling } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/account/billing — the live plan and every grant this account holds.
export const GET = withRoute({
  auth: "required",
  handler: async ({ supabase, userId }) => ok(await getBilling(supabase, userId)),
});
