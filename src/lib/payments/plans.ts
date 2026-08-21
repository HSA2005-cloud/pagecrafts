import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/errors/respond";
import { supabaseAdmin } from "@/lib/data/supabase-admin";
import { getStoredPlan, setUserPlan } from "@/lib/data/plan";
import {
    PLAN_CATALOG,
    planRank,
    toPlanId,
    type PlanId,
} from "@/lib/plans/catalog";
import {
    createOrder,
    publishableKeyId,
    verifyPaymentSignature,
    type PlanNotes,
} from "./razorpay";
import { inrToPaise } from "./pricing";

// Buying a plan (R-plans). The account-level sibling of checkout.ts.
//
// The shape is the same and for the same reasons: the price is read here from PLAN_CATALOG,
// never from the request; the order carries server-written notes that say which plan and for
// whom; and the plan is not moved until a payment is *verified* — either by the checkout
// signature (verifyPlanPayment) or by the signed webhook (applyPlanOrder). The browser
// reporting success is a claim, not a fact.

export type PaidPlan = Exclude<PlanId, "starter">;

function isPaidPlan(plan: PlanId): plan is PaidPlan {
    return plan === "pro" || plan === "premium";
}

export interface PlanCheckoutResponse {
    /** True when there is nothing to pay: the account already holds this plan or a higher one. */
    granted: boolean;
    /** The plan the account will hold once this is done. */
    plan: PlanId;
    orderId?: string;
    amountInPaise?: number;
    currency?: "INR";
    keyId?: string;
    priceInr?: number;
}

/**
 * Start paying for a plan, or discover there is nothing to pay.
 *
 * An account already at or above the requested plan is told `granted: true` and no order is
 * created — buying Pro again, or buying Pro while on Premium, takes no money and changes
 * nothing. Otherwise a Razorpay order is created, a `plan_purchases` row is written to
 * remember it, and the browser gets what it needs to open checkout. The plan itself does not
 * move here; it waits for verification.
 */
export async function startPlanCheckout(
    supabase: SupabaseClient,
    userId: string,
    plan: PlanId,
): Promise<PlanCheckoutResponse> {
    if (!isPaidPlan(plan)) {
        // Starter is the default nobody buys; asking to "purchase" it is a bad request.
        throw new ApiError("validation_failed", "That plan cannot be purchased.");
    }

    const current = await getStoredPlan(supabase);
    if (planRank(current) >= planRank(plan)) {
        return { granted: true, plan: current };
    }

    const priceInr = PLAN_CATALOG[plan].priceInr;
    const amountInPaise = inrToPaise(priceInr);

    const notes: PlanNotes = { kind: "plan", plan, userId };
    const order = await createOrder(amountInPaise, `plan_${plan}_${Date.now()}`, notes);

    // The purchase is remembered before the browser opens checkout, so a webhook that beats
    // the verify call (or a verify with no prior webhook) both find the same row to settle.
    const admin = supabaseAdmin();
    const { error } = await admin.from("plan_purchases").insert({
        user_id: userId,
        plan,
        amount_inr: priceInr,
        razorpay_order_id: order.id,
        status: "created",
    });
    if (error) {
        throw new ApiError("internal", "We could not start that payment. Please try again.", error.message);
    }

    return {
        granted: false,
        plan,
        orderId: order.id,
        amountInPaise: order.amount,
        currency: "INR",
        keyId: publishableKeyId(),
        priceInr,
    };
}

interface PurchaseRow {
    user_id: string;
    plan: PlanId;
    verified: boolean;
    razorpay_payment_id: string | null;
}

/**
 * Settle a purchase and move the plan. Idempotent, service-role only.
 *
 * Called from two verified paths — the checkout verify route and the signed webhook — so a
 * payment that arrives twice (a retried webhook, a verify racing a webhook) settles once.
 * The order row is the dedupe key: once it is `verified`, this returns the plan it already
 * granted rather than granting again, and setUserPlan only ever moves a plan upward.
 */
async function applyPurchase(orderId: string, paymentId: string): Promise<{ plan: PlanId; userId: string }> {
    const admin = supabaseAdmin();

    const { data, error } = await admin
        .from("plan_purchases")
        .select("user_id, plan, verified, razorpay_payment_id")
        .eq("razorpay_order_id", orderId)
        .maybeSingle();

    if (error) {
        throw new ApiError("internal", "Could not read that payment.", error.message);
    }
    if (!data) {
        throw new ApiError("not_found", "We could not find that order.");
    }

    const row = data as PurchaseRow;

    // Already settled: return what it granted. A duplicate callback lands here and is a no-op.
    if (row.verified) {
        return { plan: toPlanId(row.plan), userId: row.user_id };
    }

    const { error: updateError } = await admin
        .from("plan_purchases")
        .update({ razorpay_payment_id: paymentId, status: "paid", verified: true })
        .eq("razorpay_order_id", orderId);

    // 23505 on the unique payment id means this exact payment already settled another order —
    // a replay. The plan is still whatever it was; do not grant off a reused payment.
    if (updateError && updateError.code !== "23505") {
        throw new ApiError("internal", "Could not record that payment.", updateError.message);
    }

    const plan = await setUserPlan(row.user_id, toPlanId(row.plan));
    return { plan, userId: row.user_id };
}

export interface PlanVerifyInput {
    orderId: string;
    paymentId: string;
    signature: string;
}

/**
 * Verify a checkout completion and apply it (R-plans, SEC).
 *
 * The signature is checked first — an unsigned or forged completion never touches the plan.
 * Then the order must belong to the caller: settling someone else's order would let a signed
 * customer ride another person's payment. Only then is the purchase applied.
 */
export async function verifyPlanPayment(
    userId: string,
    input: PlanVerifyInput,
): Promise<{ plan: PlanId }> {
    if (!verifyPaymentSignature(input.orderId, input.paymentId, input.signature)) {
        throw new ApiError(
            "payment_required",
            "Your payment was received, but we couldn't verify it yet. Please check your plan status before trying again.",
            "razorpay signature did not verify",
        );
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
        .from("plan_purchases")
        .select("user_id")
        .eq("razorpay_order_id", input.orderId)
        .maybeSingle();

    if (error) throw new ApiError("internal", "Could not read that payment.", error.message);
    if (!data || (data as { user_id: string }).user_id !== userId) {
        // Same answer for "not yours" and "does not exist": a stranger learns nothing.
        throw new ApiError("not_found", "We could not find that order.");
    }

    const { plan } = await applyPurchase(input.orderId, input.paymentId);
    return { plan };
}

/**
 * Apply a plan order from a verified webhook. The signature was checked on the raw body
 * before this is called, so the notes are trusted; the order row still gates the grant.
 */
export async function applyPlanOrder(orderId: string, paymentId: string): Promise<void> {
    await applyPurchase(orderId, paymentId);
}
