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
// Auth is optional on purpose. Razorpay can keep the modal open long enough for the
// session cookie to go stale; requiring a session then showed "sign in again" after a
// successful payment and never unlocked Pro.
//
// Trust is:
//   1. HMAC-SHA256(order_id|payment_id, KEY_SECRET) matching the signature
//   2. Order notes loaded from Razorpay (never from the browser)
//
// The webhook remains a second, idempotent grant path for the same payment.
export const POST = withRoute<Body>({
    auth: "none",
    schema: paymentVerifySchema,
    handler: async ({ body }) => {
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
        const fulfilled = await fulfillPaidNotes(order.notes, {
            paymentId: body.razorpay_payment_id,
            orderId: body.razorpay_order_id,
        });

        console.info("[payments] checkout verified and granted", {
            orderId: body.razorpay_order_id,
            paymentId: body.razorpay_payment_id,
            kind: fulfilled.kind,
        });

        return ok({
            verified: true,
            granted: true,
            kind: fulfilled.kind,
        });
    },
});
