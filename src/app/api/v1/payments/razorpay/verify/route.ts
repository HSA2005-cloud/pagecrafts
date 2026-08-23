import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok, fail } from "@/lib/errors/respond";
import { paymentVerifySchema } from "@/lib/contracts/schemas";
import { fulfillPaidNotes } from "@/lib/payments/checkout";
import { fetchOrder, verifyPaymentSignature } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = z.infer<typeof paymentVerifySchema>;

// POST /api/v1/payments/razorpay/verify — confirm checkout and grant the purchase.
//
// The Razorpay modal calls `handler` with three tokens when a payment succeeds.
// The browser sends them here. Trust comes from:
//   1. HMAC-SHA256(order_id|payment_id, KEY_SECRET) matching the signature
//   2. Order notes loaded from Razorpay (never from the browser)
//   3. notes.userId matching the signed-in session
//
// The webhook remains a second, idempotent grant path for the same payment.
//
// Status codes are addressed to the browser:
//   200 — signature matches and the entitlement was written (or already present).
//   400 — signature mismatch or missing fields. Do not show success.
export const POST = withRoute<Body>({
    auth: "required",
    schema: paymentVerifySchema,
    handler: async ({ body, userId }) => {
        const valid = verifyPaymentSignature(
            body.razorpay_order_id,
            body.razorpay_payment_id,
            body.razorpay_signature,
        );

        if (!valid) {
            console.error("[payments] checkout signature mismatch", {
                orderId: body.razorpay_order_id,
                paymentId: body.razorpay_payment_id,
            });
            return fail(
                "validation_failed",
                "Payment verification failed. Please contact support if you were charged.",
            );
        }

        const order = await fetchOrder(body.razorpay_order_id);
        const fulfilled = await fulfillPaidNotes(
            order.notes,
            {
                paymentId: body.razorpay_payment_id,
                orderId: body.razorpay_order_id,
            },
            { requireUserId: userId },
        );

        console.info("[payments] checkout verified and fulfilled", {
            orderId: body.razorpay_order_id,
            paymentId: body.razorpay_payment_id,
            kind: fulfilled.kind,
            userId,
        });

        return ok({ verified: true, kind: fulfilled.kind });
    },
});
