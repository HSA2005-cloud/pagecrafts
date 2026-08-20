import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok, fail } from "@/lib/errors/respond";
import { verifyPaymentSignature } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VerifyBody {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}

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
export const POST = withRoute<VerifyBody>({
    handler: async ({ body }) => {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return fail(
                "validation_failed",
                "Missing payment details. Please try again.",
            );
        }

        const valid = verifyPaymentSignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        );

        if (!valid) {
            console.error("[payments] checkout signature mismatch", {
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
            });
            return fail(
                "validation_failed",
                "Payment verification failed. Please contact support if you were charged.",
            );
        }

        console.info("[payments] checkout signature verified", {
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
        });

        return ok({ verified: true });
    },
});
