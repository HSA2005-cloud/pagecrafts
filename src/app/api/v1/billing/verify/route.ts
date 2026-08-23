import "server-only";
import { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok, ApiError } from "@/lib/errors/respond";
import type { PaidPlan } from "@/lib/contracts";
import { verifyPaymentSignature } from "@/lib/billing/razorpay";
import { grantPlan } from "@/lib/billing/grant";
import { supabaseAdmin } from "@/lib/data/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The plan is NOT accepted from the client — it is read from the server-created order below.
const schema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

// POST /api/v1/billing/verify — verify a Checkout result and grant the plan (E-1 §payments).
//
// The security boundary: the plan is granted only if the Razorpay signature over
// (order_id|payment_id) verifies against our key secret. An invalid or missing signature is
// rejected and nothing is changed. The plan comes from the order we created, so a client
// cannot pay for Pro and claim Premium.
export const POST = withRoute<z.infer<typeof schema>>({
  auth: "required",
  schema,
  handler: async ({ body, userId }) => {
    const valid = verifyPaymentSignature(
      body.razorpay_order_id,
      body.razorpay_payment_id,
      body.razorpay_signature,
    );

    if (!valid) {
      throw new ApiError(
        "validation_failed",
        "We could not verify this payment. Your plan was not changed.",
        `order=${body.razorpay_order_id}`,
      );
    }

    // The order (and its plan) must have been created by us. Trusting the body's plan would
    // let a Pro payment claim Premium.
    const { data: payment } = await supabaseAdmin()
      .from("payments")
      .select("user_id, plan")
      .eq("razorpay_order_id", body.razorpay_order_id)
      .maybeSingle();

    const row = payment as { user_id: string; plan: PaidPlan } | null;
    if (!row || row.user_id !== userId) {
      throw new ApiError(
        "not_found",
        "That order was not found for your account.",
        `order=${body.razorpay_order_id}`,
      );
    }

    const result = await grantPlan(
      userId,
      row.plan,
      body.razorpay_order_id,
      body.razorpay_payment_id,
    );

    return ok({ plan: result.plan, status: "active", alreadyGranted: result.alreadyGranted });
  },
});
