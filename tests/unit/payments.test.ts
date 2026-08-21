import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { inrToPaise, isFree, isPaidTier, PREMIUM_PRICE_INR, PRO_PRICE_INR, publishPriceInr, requiredPlanForStyle, requiredPlanForTemplate } from "@/lib/payments/pricing";
import { capturedPayment, verifyWebhook } from "@/lib/payments/razorpay";

// The gate at publish (R3). Two things carry the weight: the price a person is shown must
// be the price they are charged, and a webhook must be provably from Razorpay before it can
// unlock anything.

describe("pricing", () => {
    it("charges what the tile says", () => {
        expect(publishPriceInr("free")).toBe(0);
        expect(publishPriceInr("premium")).toBe(499);
        expect(publishPriceInr("signature")).toBe(999);
        expect(PRO_PRICE_INR).toBe(499);
        expect(PREMIUM_PRICE_INR).toBe(999);
        expect(inrToPaise(PRO_PRICE_INR)).toBe(49_900);
    });

    it("counts in paise, because Razorpay does", () => {
        expect(inrToPaise(499)).toBe(49_900);
        expect(inrToPaise(999)).toBe(99_900);
        // The classic payments bug is being out by a hundred. It can only happen here.
        expect(inrToPaise(publishPriceInr("premium"))).not.toBe(499);
    });

    it("knows when there is nothing to pay", () => {
        expect(isFree("free")).toBe(true);
        expect(isFree("premium")).toBe(false);
        expect(isPaidTier("free")).toBe(false);
        expect(isPaidTier(undefined)).toBe(false);
        expect(isPaidTier("premium")).toBe(true);
        expect(isPaidTier("signature")).toBe(true);
        expect(isPaidTier("pro")).toBe(true);
        expect(requiredPlanForTemplate("premium")).toBe("pro");
        expect(requiredPlanForTemplate("signature")).toBe("premium");
        expect(requiredPlanForTemplate("free")).toBeNull();
        expect(requiredPlanForStyle("pro")).toBe("pro");
        expect(requiredPlanForStyle("premium")).toBe("premium");
        expect(requiredPlanForStyle("free")).toBeNull();
    });
});

describe("webhook verification", () => {
    const SECRET = "whsec-test";
    const body = JSON.stringify({ event: "payment.captured" });

    beforeEach(() => {
        vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", SECRET);
        vi.resetModules();
    });

    function sign(payload: string, secret = SECRET) {
        return createHmac("sha256", secret).update(payload).digest("hex");
    }

    it("accepts a body signed with the webhook secret", async () => {
        const { verifyWebhook: verify } = await import("@/lib/payments/razorpay");
        expect(verify(body, sign(body))).toBe(true);
    });

    it("refuses a signature made with the wrong secret", async () => {
        const { verifyWebhook: verify } = await import("@/lib/payments/razorpay");
        expect(verify(body, sign(body, "not-the-secret"))).toBe(false);
    });

    it("refuses a body that changed after it was signed", async () => {
        const { verifyWebhook: verify } = await import("@/lib/payments/razorpay");
        const signature = sign(body);
        expect(verify(JSON.stringify({ event: "payment.failed" }), signature)).toBe(false);
    });

    it("refuses a missing signature outright", async () => {
        // Through the dynamic import like its neighbours: the module reads the secret once,
        // at load, so the copy imported at the top of this file predates stubEnv.
        const { verifyWebhook: verify } = await import("@/lib/payments/razorpay");
        expect(verify(body, null)).toBe(false);
    });
});

describe("reading a webhook body", () => {
    const entity = {
        id: "pay_123",
        order_id: "order_123",
        notes: { projectId: "p_1", userId: "u_1", kind: "publish" },
    };

    it("finds a captured payment and the notes we wrote onto its order", () => {
        const found = capturedPayment({
            event: "payment.captured",
            payload: { payment: { entity } },
        });

        expect(found).toEqual({
            paymentId: "pay_123",
            orderId: "order_123",
            notes: { projectId: "p_1", userId: "u_1", kind: "publish" },
        });
    });

    it("ignores the other events Razorpay sends down the same URL", () => {
        expect(capturedPayment({ event: "payment.failed", payload: { payment: { entity } } })).toBeNull();
        expect(capturedPayment({ event: "order.paid" })).toBeNull();
        expect(capturedPayment({})).toBeNull();
        expect(capturedPayment(null)).toBeNull();
    });

    it("finds a captured Pro payment without a project", () => {
        const found = capturedPayment({
            event: "payment.captured",
            payload: {
                payment: {
                    entity: {
                        id: "pay_pro",
                        order_id: "order_pro",
                        notes: { userId: "u_1", kind: "pro" },
                    },
                },
            },
        });

        expect(found).toEqual({
            paymentId: "pay_pro",
            orderId: "order_pro",
            notes: { userId: "u_1", kind: "pro" },
        });
    });

    it("ignores a captured payment with no order to match it to", () => {
        expect(
            capturedPayment({
                event: "payment.captured",
                payload: { payment: { entity: { id: "pay_123" } } },
            }),
        ).toBeNull();
    });
});

describe("the routes that open checkout", () => {
    it("grants Pro from the webhook when the notes say so", () => {
        const webhook = readFileSync(
            join(process.cwd(), "src", "app", "api", "v1", "payments", "razorpay", "webhook", "route.ts"),
            "utf8",
        );
        const hook = readFileSync(
            join(process.cwd(), "src", "hooks", "useRazorpayCheckout.tsx"),
            "utf8",
        );

        expect(webhook).toContain("grantTemplate");
        expect(webhook).toContain("grantStyle");
        expect(webhook).toContain('kind === "template"');
        expect(webhook).toContain('kind === "style"');
        expect(hook).toContain("openTemplateCheckout");
        expect(hook).toContain("openStyleCheckout");
        expect(hook).toContain("openPlanCheckout");
        expect(hook).toContain("openAdvancedCheckout");
        expect(hook).toContain("openGenerationPassCheckout");
        expect(hook).toContain("/api/v1/templates/");
        expect(hook).toContain("/api/v1/styles/");
        expect(hook).toContain("/api/v1/account/billing/checkout");
        expect(hook).toContain("/api/v1/account/packages/advanced/checkout");
        expect(hook).toContain("/api/v1/account/packages/generation/checkout");
        expect(hook).toContain("checkout.razorpay.com");
        expect(webhook).toContain("grantAdvanced");
        expect(webhook).toContain("grantGenerationPassPurchase");
        expect(webhook).toContain('kind === "advanced"');
        expect(webhook).toContain('kind === "generation_pass"');
        expect(webhook).toContain("grantPro");
        expect(webhook).toContain("grantPremium");
        expect(webhook).not.toContain("verified: true");
    });

    it("wires Packages checkout like publish — confirm dialog, no paymentsReady hard-disable", () => {
        const panel = readFileSync(
            join(process.cwd(), "src", "components", "settings", "PackagesPanel.tsx"),
            "utf8",
        );
        const page = readFileSync(
            join(process.cwd(), "src", "app", "packages", "page.tsx"),
            "utf8",
        );

        expect(panel).toContain("confirmDialog");
        expect(panel).toContain("openAdvancedCheckout");
        expect(panel).toContain("openGenerationPassCheckout");
        expect(panel).toContain("RAZORPAY_KEY_ID");
        expect(panel).toContain("RAZORPAY_KEY_SECRET");
        expect(panel).not.toContain("disabled={!billing.paymentsReady");
        expect(page).toContain("paymentsConfigured");
        expect(page).toContain("paymentsReady: paymentsConfigured()");
    });

    it("opens Razorpay when a paid template or look is chosen, and does not grant from the browser", () => {
        const unlock = readFileSync(
            join(process.cwd(), "src", "hooks", "useUnlockPaidDesign.ts"),
            "utf8",
        );
        const chooser = readFileSync(
            join(process.cwd(), "src", "components", "discovery", "StyleChooser.tsx"),
            "utf8",
        );
        const capture = readFileSync(
            join(process.cwd(), "src", "components", "discovery", "IntentCapture.tsx"),
            "utf8",
        );
        const fork = readFileSync(join(process.cwd(), "src", "lib", "data", "projects.ts"), "utf8");
        const choose = readFileSync(
            join(process.cwd(), "src", "app", "api", "v1", "projects", "[id]", "generate", "choose", "route.ts"),
            "utf8",
        );
        const verify = readFileSync(
            join(process.cwd(), "src", "app", "api", "v1", "payments", "razorpay", "verify", "route.ts"),
            "utf8",
        );

        expect(unlock).toContain("openPlanCheckout");
        expect(unlock).toContain("waitForPlanGrant");
        expect(chooser).toContain("LockedPlanNotice");
        expect(chooser).not.toContain("BuyPaidItemCta");
        expect(chooser).not.toContain("for now you can use any of them");
        expect(capture).toContain("LockedPlanNotice");
        expect(capture).not.toContain("unlockTemplate");
        expect(fork).toContain("requiredPlanForTemplate");
        expect(fork).toContain("PAID_DESIGN_MESSAGE");
        expect(choose).toContain("hasStyleAccess");
        expect(choose).not.toContain("hasPro");
        expect(verify).not.toContain("grantPro");
        expect(verify).not.toContain("grantPublish");
    });
});
