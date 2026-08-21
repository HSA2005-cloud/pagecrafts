import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { planVerifySchema } from "@/lib/contracts/schemas";
import { verifyPlanPayment } from "@/lib/payments/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VerifyBody = z.infer<typeof planVerifySchema>;

// POST /api/v1/plans/verify — confirm a checkout completion and apply the plan (R-plans, SEC).
//
// The server recomputes the Razorpay signature over order|payment with the key secret; a
// forged or unsigned completion never moves the plan. The order must also belong to the
// caller. Only then is the purchase settled and the account plan raised — idempotently, so a
// verify that races the webhook grants once.
export const POST = withRoute<VerifyBody>({
  schema: planVerifySchema,
  handler: async ({ userId, body }) =>
    ok(
      await verifyPlanPayment(userId, {
        orderId: body.razorpayOrderId,
        paymentId: body.razorpayPaymentId,
        signature: body.razorpaySignature,
      }),
    ),
});
