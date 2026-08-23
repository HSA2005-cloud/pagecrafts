import "server-only";
import { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok, ApiError } from "@/lib/errors/respond";
import { PLAN_PRICE_INR } from "@/lib/contracts";
import { createOrder, razorpayConfigured, publicKeyId } from "@/lib/billing/razorpay";
import { supabaseAdmin } from "@/lib/data/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ plan: z.enum(["pro", "premium"]) });

// POST /api/v1/billing/order — create a Razorpay order for a plan upgrade (E-1 §payments).
//
// The amount is decided here from PLAN_PRICE_INR, never sent by the client, and the order's
// plan is recorded server-side so verification cannot be told a different (cheaper) plan later.
export const POST = withRoute<z.infer<typeof schema>>({
  auth: "required",
  schema,
  handler: async ({ body, userId }) => {
    if (!razorpayConfigured()) {
      throw new ApiError(
        "service_unavailable",
        "Payments are not available right now. (Razorpay keys are not configured.)",
      );
    }

    const amountInr = PLAN_PRICE_INR[body.plan];
    const order = await createOrder(amountInr, `plan_${body.plan}_${userId.slice(0, 8)}`);

    // Record the intended purchase, keyed by the order id, before the browser pays. Verify
    // reads the plan back from this row rather than trusting the client.
    await supabaseAdmin().from("payments").upsert(
      {
        user_id: userId,
        plan: body.plan,
        razorpay_order_id: order.id,
        amount_inr: amountInr,
        status: "created",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "razorpay_order_id" },
    );

    return ok({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: publicKeyId(),
      plan: body.plan,
    });
  },
});
