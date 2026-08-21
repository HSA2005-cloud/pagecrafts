import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { getBilling, revokePro } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/account/billing/downgrade — switch this account back to Starter.
//
// No body. Does not refund a payment and does not take a published site off the internet.
export const POST = withRoute({
  auth: "required",
  handler: async ({ supabase, userId }) => {
    await revokePro(userId);
    return ok(await getBilling(supabase, userId));
  },
});
