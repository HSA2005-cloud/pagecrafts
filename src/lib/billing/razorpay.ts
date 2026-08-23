import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay server-side integration (E-1 §payments).
//
// Two rules the whole flow rests on, both enforced here rather than in the browser:
//   1. The order is created server-side, so the amount is set by us, not the client.
//   2. The plan is granted only after a signature is verified server-side. The browser
//      reporting "payment success" proves nothing — Razorpay signs the (order, payment) pair
//      with our key secret, and this is where that signature is checked.
//
// Test mode is the same code path: it just uses test keys (rzp_test_...). No live keys or real
// transactions are needed to exercise the verification and grant logic.

export interface RazorpayOrder {
    id: string;
    amount: number; // paise
    currency: string;
    receipt?: string;
}

function keyId(): string {
    return process.env.RAZORPAY_KEY_ID?.trim() ?? "";
}

function keySecret(): string {
    return process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
}

function webhookSecret(): string {
    return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";
}

/** True when order creation can talk to Razorpay (both key halves present). */
export function razorpayConfigured(): boolean {
    return keyId().length > 0 && keySecret().length > 0;
}

export function publicKeyId(): string {
    return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || keyId();
}

/** Create an order server-side. Amount is authoritative here and never taken from the client. */
export async function createOrder(amountInr: number, receipt: string): Promise<RazorpayOrder> {
    if (!razorpayConfigured()) {
        throw new Error("Razorpay is not configured");
    }

    const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            amount: amountInr * 100, // paise
            currency: "INR",
            receipt,
            notes: { receipt },
        }),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Razorpay order failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    return (await res.json()) as RazorpayOrder;
}

function safeEqualHex(a: string, b: string): boolean {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    // timingSafeEqual throws on length mismatch; a mismatched length is already a mismatch.
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
}

/**
 * Verify a Razorpay Checkout signature: HMAC_SHA256(`${orderId}|${paymentId}`, key_secret).
 * Returns false (never throws) for any missing input, so an invalid payment is simply rejected.
 */
export function verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
): boolean {
    const secret = keySecret();
    if (!secret || !orderId || !paymentId || !signature) return false;

    const expected = createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

    return safeEqualHex(expected, signature);
}

/** Verify a Razorpay webhook body signature: HMAC_SHA256(rawBody, webhook_secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    const secret = webhookSecret();
    if (!secret || !signature) return false;

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return safeEqualHex(expected, signature);
}
