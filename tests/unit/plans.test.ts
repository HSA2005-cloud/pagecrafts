import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
    PLANS,
    canAccessTier,
    maxPlan,
    planGrantsPro,
    planRank,
    requiredPlanForTier,
    toPlanId,
} from "@/lib/plans/catalog";

// The plan rules and the checkout-signature check (R-plans).
//
// These are the parts a paywall cannot be wrong about: which plan a design tier needs, and
// whether a Razorpay completion is genuine. Both are pure enough to pin without a database.

describe("plan catalogue", () => {
    it("orders the plans starter, pro, premium with the right prices", () => {
        expect(PLANS.map((p) => p.id)).toEqual(["starter", "pro", "premium"]);
        expect(PLANS.map((p) => p.priceInr)).toEqual([0, 499, 999]);
        expect(PLANS.find((p) => p.id === "pro")?.popular).toBe(true);
    });

    it("maps each design tier to the plan that unlocks it", () => {
        expect(requiredPlanForTier("free")).toBe("starter");
        expect(requiredPlanForTier("premium")).toBe("pro");
        expect(requiredPlanForTier("signature")).toBe("premium");
    });

    it("lets a plan use its own tier and everything below it", () => {
        // Starter: free only.
        expect(canAccessTier("starter", "free")).toBe(true);
        expect(canAccessTier("starter", "premium")).toBe(false);
        expect(canAccessTier("starter", "signature")).toBe(false);
        // Pro: free + premium, but not signature.
        expect(canAccessTier("pro", "free")).toBe(true);
        expect(canAccessTier("pro", "premium")).toBe(true);
        expect(canAccessTier("pro", "signature")).toBe(false);
        // Premium: everything.
        expect(canAccessTier("premium", "free")).toBe(true);
        expect(canAccessTier("premium", "premium")).toBe(true);
        expect(canAccessTier("premium", "signature")).toBe(true);
    });

    it("ranks plans and never moves one downward", () => {
        expect(planRank("starter")).toBeLessThan(planRank("pro"));
        expect(planRank("pro")).toBeLessThan(planRank("premium"));
        expect(maxPlan("pro", "starter")).toBe("pro");
        expect(maxPlan("pro", "premium")).toBe("premium");
        expect(maxPlan("premium", "pro")).toBe("premium");
    });

    it("treats pro and premium as Pro-or-better, starter as not", () => {
        expect(planGrantsPro("starter")).toBe(false);
        expect(planGrantsPro("pro")).toBe(true);
        expect(planGrantsPro("premium")).toBe(true);
    });

    it("coerces unknown plan values to starter", () => {
        expect(toPlanId("pro")).toBe("pro");
        expect(toPlanId("premium")).toBe("premium");
        expect(toPlanId("enterprise")).toBe("starter");
        expect(toPlanId(undefined)).toBe("starter");
        expect(toPlanId(null)).toBe("starter");
    });
});

describe("Razorpay checkout signature", () => {
    const SECRET = "test_secret_for_signatures";
    let verifyPaymentSignature: (
        orderId: string,
        paymentId: string,
        signature: string | null,
    ) => boolean;

    beforeAll(async () => {
        // The module reads the secret once at import, so it must be in place first.
        vi.stubEnv("RAZORPAY_KEY_SECRET", SECRET);
        vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_stub");
        ({ verifyPaymentSignature } = await import("@/lib/payments/razorpay"));
    });

    const sign = (orderId: string, paymentId: string) =>
        createHmac("sha256", SECRET).update(`${orderId}|${paymentId}`).digest("hex");

    it("accepts a signature computed the way Razorpay computes it", () => {
        const order = "order_ABC123";
        const payment = "pay_XYZ789";
        expect(verifyPaymentSignature(order, payment, sign(order, payment))).toBe(true);
    });

    it("rejects a tampered order id, payment id, or signature", () => {
        const order = "order_ABC123";
        const payment = "pay_XYZ789";
        const good = sign(order, payment);

        expect(verifyPaymentSignature("order_OTHER", payment, good)).toBe(false);
        expect(verifyPaymentSignature(order, "pay_OTHER", good)).toBe(false);
        expect(verifyPaymentSignature(order, payment, good.replace(/.$/, "0"))).toBe(false);
    });

    it("rejects a missing signature", () => {
        expect(verifyPaymentSignature("order_ABC123", "pay_XYZ789", null)).toBe(false);
        expect(verifyPaymentSignature("order_ABC123", "pay_XYZ789", "")).toBe(false);
    });
});
