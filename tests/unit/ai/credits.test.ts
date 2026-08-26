import { describe, expect, it } from "vitest";

import { isOutOfAiCredits } from "@/lib/ai/jobs/credits";

describe("isOutOfAiCredits", () => {
    it("recognises spent site AI quota", () => {
        expect(
            isOutOfAiCredits(
                "payment_required",
                "You have used your 3 Starter AI generations on this site.",
            ),
        ).toBe(true);
    });

    it("ignores paid template unlock errors", () => {
        expect(
            isOutOfAiCredits(
                "payment_required",
                "This design needs Pro or Premium. Upgrade your plan with Razorpay",
            ),
        ).toBe(false);
    });
});
