import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok, fail } from "@/lib/errors/respond";
import { paymentVerifySchema } from "@/lib/contracts/schemas";
import { verifyPaymentSignature } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = z.infer<typeof paymentVerifySchema>;

// POST /api/v1/payments/razorpay/verify — immediate feedback after checkout.
//
// The Razorpay modal calls `handler` with three tokens when a payment succeeds.
// The browser sends them here to confirm the round-trip is genuine before showing
// "Payment confirmed". This is a courtesy check using KEY_SECRET — the entitlement
// is granted only when the signed webhook arrives, never here.
//
// Status codes are addressed to the browser:
//   200 — signature matches, the payment is genuine.
//   400 — signature mismatch or missing fields. Do not show success.
export const POST = withRoute<Body>({
    auth: "required",
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

        console.info("[payments] checkout signature verified", {
            orderId: body.razorpay_order_id,
            paymentId: body.razorpay_payment_id,
        });

        return ok({ verified: true });
    },
});
