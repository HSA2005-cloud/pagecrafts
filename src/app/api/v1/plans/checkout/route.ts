import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { planCheckoutSchema } from "@/lib/contracts/schemas";
import { startPlanCheckout } from "@/lib/payments/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutBody = z.infer<typeof planCheckoutSchema>;

// POST /api/v1/plans/checkout — start buying Pro or Premium (R-plans).
//
// Answers one of two things: `granted: true`, meaning the account already holds this plan or
// higher and there is nothing to pay; or a Razorpay order for the browser to open checkout
// with. Paying does not move the plan — /api/v1/plans/verify (and the signed webhook) do,
// after the payment is verified server-side.
export const POST = withRoute<CheckoutBody>({
  schema: planCheckoutSchema,
  handler: async ({ supabase, userId, body }) =>
    ok(await startPlanCheckout(supabase, userId, body.plan)),
});
