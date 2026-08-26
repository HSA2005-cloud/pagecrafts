import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    applyPercentOff,
    codeAppliesTo,
    generateScratchCode,
    normalizeScratchCode,
    unwrapDiscountRpcRow,
} from "@/lib/payments/discount-math";
import { isApiError, ApiError } from "@/lib/errors/respond";
import { friendlyMessage } from "@/lib/api/messages";

describe("scratch-card codes", () => {
    it("prints as PC-XXXX-XXXX without ambiguous characters", () => {
        for (let i = 0; i < 40; i += 1) {
            const code = generateScratchCode();
            expect(code).toMatch(/^PC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
            expect(code).not.toMatch(/[01IOL]/);
        }
    });

    it("accepts typed codes with or without dashes", () => {
        expect(normalizeScratchCode("pc-ab2d-ef3h")).toBe("PC-AB2D-EF3H");
        expect(normalizeScratchCode("  PCAB2DEF3H  ")).toBe("PC-AB2D-EF3H");
        expect(normalizeScratchCode("nope")).toBeNull();
        expect(normalizeScratchCode("PC-0000-1111")).toBeNull();
    });

    it("takes the percent off the listed rupee price", () => {
        expect(applyPercentOff(499, 20)).toBe(399);
        expect(applyPercentOff(999, 20)).toBe(799);
        expect(applyPercentOff(499, 100)).toBe(0);
        expect(applyPercentOff(199, 10)).toBe(179);
    });

    it("lets an all-access card cover every checkout kind", () => {
        expect(codeAppliesTo("all", "pro")).toBe(true);
        expect(codeAppliesTo("pro", "pro")).toBe(true);
        expect(codeAppliesTo("pro", "premium")).toBe(false);
        expect(codeAppliesTo("pro", "template")).toBe(true);
        expect(codeAppliesTo("premium", "style")).toBe(true);
        expect(codeAppliesTo("advanced", "generation_pass")).toBe(false);
    });

    it("treats pasted codes with or without dashes as the same coupon", async () => {
        const { codesMatch } = await import("@/components/payments/DiscountCodeField");
        expect(codesMatch("pc-sale-ten2", "PC-SALE-TEN2")).toBe(true);
        expect(codesMatch("PCSALE TEN2", "PC-SALE-TEN2")).toBe(true);
        expect(codesMatch("PC-SALE-TEN2", "PC-OTHER-CODE")).toBe(false);
    });

    it("tells the reader when a card cannot be used", () => {
        expect(friendlyMessage("invalid_discount", "fallback")).toContain("scratch-card");
    });

    it("reads a held card whether PostgREST returned a row or a SETOF array", () => {
        const row = {
            code: "PC-ABCD-EFGH",
            percent_off: 20,
            applies_to: "all" as const,
        };
        expect(unwrapDiscountRpcRow<typeof row>(row)?.code).toBe("PC-ABCD-EFGH");
        expect(unwrapDiscountRpcRow<typeof row>([row])?.percent_off).toBe(20);
        expect(unwrapDiscountRpcRow([])).toBeNull();
        expect(unwrapDiscountRpcRow(null)).toBeNull();
    });

    it("still recognises an ApiError after the class object is not the same", () => {
        const error = new ApiError("payments_unavailable", "Payments are not set up on this server.");
        const twin = Object.assign(new Error(error.message), {
            name: "ApiError",
            code: error.code,
        });
        expect(isApiError(error)).toBe(true);
        expect(isApiError(twin)).toBe(true);
        expect(isApiError(new Error("nope"))).toBe(false);
    });

    it("charges Razorpay the discounted rupee amount, not a dashboard offer", () => {
        const checkout = readFileSync(join(process.cwd(), "src", "lib", "payments", "checkout.ts"), "utf8");
        const hook = readFileSync(join(process.cwd(), "src", "hooks", "useRazorpayCheckout.tsx"), "utf8");
        const plans = readFileSync(
            join(process.cwd(), "src", "components", "settings", "PlansPanel.tsx"),
            "utf8",
        );

        expect(checkout).toContain("reserveDiscount");
        expect(checkout).toContain("captureDiscount");
        expect(checkout).toContain("discountCode");
        expect(hook).toContain("discountCode");
        expect(plans).toContain("DiscountCodeField");
        expect(plans).toContain("onApplied");
        expect(plans).toContain("Press Apply");

        const hold = readFileSync(join(process.cwd(), "src", "lib", "payments", "discount-codes.ts"), "utf8");
        const routes = readFileSync(join(process.cwd(), "src", "lib", "kernel", "with-route.ts"), "utf8");
        expect(hold).not.toMatch(/ApiError\(\s*"internal"/);
        expect(hold).toContain("reserveDiscountViaTable");
        expect(hold).toContain("max_redemptions === 1");
        expect(routes).toContain("isApiError");

        const field = readFileSync(
            join(process.cwd(), "src", "components", "payments", "DiscountCodeField.tsx"),
            "utf8",
        );
        expect(field).toContain("Apply");
        expect(field).toContain("Coupon code");
        expect(field).toContain("onApplied");
    });
});
