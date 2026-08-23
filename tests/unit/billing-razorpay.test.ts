import { describe, expect, it, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

import { verifyPaymentSignature, verifyWebhookSignature } from "@/lib/billing/razorpay";

// The security boundary of the whole payment flow: a plan is granted only when Razorpay's
// signature verifies against our secret. These prove the check accepts a genuine signature and
// rejects everything else — a tampered order id, a wrong secret, or a missing field — so a
// browser reporting "success" cannot buy an upgrade on its own.

const SECRET = "rzp_test_secret_key";
const WEBHOOK = "whsec_test";

beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK;
});

const sign = (order: string, payment: string, secret = SECRET) =>
    createHmac("sha256", secret).update(`${order}|${payment}`).digest("hex");

describe("verifyPaymentSignature", () => {
    it("accepts a genuine signature", () => {
        expect(verifyPaymentSignature("order_1", "pay_1", sign("order_1", "pay_1"))).toBe(true);
    });

    it("rejects a signature made with the wrong secret", () => {
        expect(
            verifyPaymentSignature("order_1", "pay_1", sign("order_1", "pay_1", "not_the_secret")),
        ).toBe(false);
    });

    it("rejects a tampered order id", () => {
        const sig = sign("order_1", "pay_1");
        expect(verifyPaymentSignature("order_2", "pay_1", sig)).toBe(false);
    });

    it("rejects an empty or missing signature", () => {
        expect(verifyPaymentSignature("order_1", "pay_1", "")).toBe(false);
    });

    it("rejects when the secret is not configured", () => {
        delete process.env.RAZORPAY_KEY_SECRET;
        expect(verifyPaymentSignature("order_1", "pay_1", sign("order_1", "pay_1"))).toBe(false);
    });
});

describe("verifyWebhookSignature", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const webhookSig = (raw: string, secret = WEBHOOK) =>
        createHmac("sha256", secret).update(raw).digest("hex");

    it("accepts a genuine webhook signature", () => {
        expect(verifyWebhookSignature(body, webhookSig(body))).toBe(true);
    });

    it("rejects a tampered body", () => {
        const sig = webhookSig(body);
        expect(verifyWebhookSignature(body + " ", sig)).toBe(false);
    });

    it("rejects a null signature", () => {
        expect(verifyWebhookSignature(body, null)).toBe(false);
    });
});
