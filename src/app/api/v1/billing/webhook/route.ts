import "server-only";

import { ok, fail, guard } from "@/lib/errors/respond";
import type { PaidPlan } from "@/lib/contracts";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { grantPlan } from "@/lib/billing/grant";
import { supabaseAdmin } from "@/lib/data/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/billing/webhook — Razorpay server-to-server confirmation (E-1 §payments).
//
// The authoritative grant path: even if the browser never calls /verify (closed tab, network
// drop), Razorpay posts here and the plan is granted once the body's HMAC signature verifies
// against the webhook secret. Idempotent via the payments order id, so a retried delivery does
// not grant twice. No session — the signature is the authentication.
export async function POST(req: Request) {
  return guard(async () => {
    const raw = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    if (!verifyWebhookSignature(raw, signature)) {
      return fail("validation_failed", "Invalid webhook signature.");
    }

    let event: {
      event?: string;
      payload?: {
        payment?: { entity?: { id?: string; order_id?: string } };
        order?: { entity?: { id?: string } };
      };
    };
    try {
      event = JSON.parse(raw);
    } catch {
      return fail("validation_failed", "Webhook body was not JSON.");
    }

    const orderId =
      event.payload?.payment?.entity?.order_id ?? event.payload?.order?.entity?.id ?? null;
    const paymentId = event.payload?.payment?.entity?.id ?? "";

    if (
      orderId &&
      (event.event === "payment.captured" || event.event === "order.paid")
    ) {
      const { data: payment } = await supabaseAdmin()
        .from("payments")
        .select("user_id, plan")
        .eq("razorpay_order_id", orderId)
        .maybeSingle();

      const row = payment as { user_id: string; plan: PaidPlan } | null;
      if (row) await grantPlan(row.user_id, row.plan, orderId, paymentId);
    }

    // Always 200 for a validly-signed event, so Razorpay does not retry a handled delivery.
    return ok({ received: true });
  });
}
