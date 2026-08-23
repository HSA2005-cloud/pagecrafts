import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { friendlyMessage } from "@/lib/api/messages";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("plan checkout errors", () => {
    it("tells the reader when payments are not configured", () => {
        expect(friendlyMessage("payments_unavailable", "fallback")).toContain("Checkout is not set up");
    });

    it("blocks User Plans checkout until Razorpay keys are present", () => {
        const plans = read("src", "components", "settings", "PlansPanel.tsx");
        const checkout = read("src", "lib", "payments", "checkout.ts");
        const razorpay = read("src", "lib", "payments", "razorpay.ts");

        expect(plans).toContain("paymentsReady");
        expect(plans).toContain("RAZORPAY_KEY_ID");
        expect(checkout).toContain("payments_unavailable");
        expect(checkout).toContain("PAGECRAFTS_DEV_GRANT_PLANS");
        expect(razorpay).toContain("payments_unavailable");
    });
});
