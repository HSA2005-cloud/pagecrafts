import "server-only";

import { supabaseAdmin } from "@/lib/data/supabase-admin";
import { PLAN_PRICE_INR, type PaidPlan } from "@/lib/contracts";

export interface GrantResult {
    granted: boolean;
    alreadyGranted: boolean;
    plan: PaidPlan;
}

/**
 * Grant a paid plan after a payment has been verified (E-1 §payments).
 *
 * Writes with the service role because the entitlements table is server-write only — a client
 * cannot grant itself a plan (RLS has no INSERT policy for it). The unique `razorpay_order_id`
 * on `payments` is the idempotency key: a replayed verify call or a duplicate webhook finds the
 * order already marked paid and does nothing, so a plan is never granted twice for one payment.
 *
 * Callers MUST verify the Razorpay signature before calling this. This function assumes the
 * payment is genuine and only handles persistence + idempotency.
 */
export async function grantPlan(
    userId: string,
    plan: PaidPlan,
    orderId: string,
    paymentId: string,
): Promise<GrantResult> {
    const admin = supabaseAdmin();

    // Idempotency: if this order is already paid, do not grant again.
    const { data: existing } = await admin
        .from("payments")
        .select("status")
        .eq("razorpay_order_id", orderId)
        .maybeSingle();

    if ((existing as { status: string } | null)?.status === "paid") {
        return { granted: false, alreadyGranted: true, plan };
    }

    // Record/settle the payment first, keyed by the unique order id.
    await admin
        .from("payments")
        .upsert(
            {
                user_id: userId,
                plan,
                razorpay_order_id: orderId,
                razorpay_payment_id: paymentId,
                amount_inr: PLAN_PRICE_INR[plan],
                status: "paid",
                updated_at: new Date().toISOString(),
            },
            { onConflict: "razorpay_order_id" },
        );

    // Grant the entitlement (user-level; project_id null). Only add one if an active row of
    // this kind is not already present, so re-grants stay clean.
    const { data: active } = await admin
        .from("entitlements")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", plan)
        .eq("status", "active");

    if (!active || active.length === 0) {
        await admin.from("entitlements").insert({
            user_id: userId,
            kind: plan,
            source: plan,
            status: "active",
        });
    }

    return { granted: true, alreadyGranted: false, plan };
}
