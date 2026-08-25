import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { planCheckoutSchema } from "@/lib/contracts/schemas";
import { startPlanCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = z.infer<typeof planCheckoutSchema>;

// POST /api/v1/account/billing/checkout — start paying for Pro or Premium.
//
// Price is decided here (pro → 499 INR, premium → 999 INR). Paying does not grant
// from the browser: /api/v1/payments/razorpay/verify verifies the signature, loads
// order notes from Razorpay, and writes the entitlement. The webhook is a second
// idempotent path for the same grant.
export const POST = withRoute<Body>({
  auth: "required",
  schema: planCheckoutSchema,
  handler: async ({ supabase, userId, body }) =>
    ok(await startPlanCheckout(supabase, userId, body.plan)),
});
