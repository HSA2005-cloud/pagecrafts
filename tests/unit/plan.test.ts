import { describe, expect, it } from "vitest";

import {
    planAllowsTier,
    isSubscriber,
    TIER_MIN_PLAN,
    PLAN_RANK,
    PLAN_PRICE_INR,
    type Plan,
} from "@/lib/contracts";

// The plan ↔ template-tier access matrix, in one place. The fork gate, the publish gate and
// the plans page all read these functions, so this is the table that decides who sees what.

describe("planAllowsTier", () => {
    const cases: Array<[Plan, "free" | "premium" | "signature", boolean]> = [
        ["starter", "free", true],
        ["starter", "premium", false],
        ["starter", "signature", false],
        ["pro", "free", true],
        ["pro", "premium", true],
        ["pro", "signature", false], // Pro unlocks premium designs, not signature ones.
        ["premium", "free", true],
        ["premium", "premium", true],
        ["premium", "signature", true],
    ];

    for (const [plan, tier, allowed] of cases) {
        it(`${plan} ${allowed ? "can" : "cannot"} use a ${tier} design`, () => {
            expect(planAllowsTier(plan, tier)).toBe(allowed);
        });
    }
});

describe("plan ranking and pricing", () => {
    it("orders starter < pro < premium", () => {
        expect(PLAN_RANK.starter).toBeLessThan(PLAN_RANK.pro);
        expect(PLAN_RANK.pro).toBeLessThan(PLAN_RANK.premium);
    });

    it("maps each tier to its minimum plan", () => {
        expect(TIER_MIN_PLAN).toEqual({ free: "starter", premium: "pro", signature: "premium" });
    });

    it("treats pro and premium as subscribers, starter not", () => {
        expect(isSubscriber("starter")).toBe(false);
        expect(isSubscriber("pro")).toBe(true);
        expect(isSubscriber("premium")).toBe(true);
    });

    it("prices the paid plans", () => {
        expect(PLAN_PRICE_INR.pro).toBeGreaterThan(0);
        expect(PLAN_PRICE_INR.premium).toBeGreaterThan(PLAN_PRICE_INR.pro);
    });
});
