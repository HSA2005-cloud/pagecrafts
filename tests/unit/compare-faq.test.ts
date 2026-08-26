import { describe, expect, it } from "vitest";
import { lookTierSite } from "@/lib/demos/look-tiers";

describe("Compare FAQ content", () => {
    it("renders real questions and answers on Free, Pro, and Premium", () => {
        for (const id of ["starter", "pro", "premium"] as const) {
            const site = lookTierSite(id);
            const html = Object.values(site.files).join("\n");
            expect(html, id).toContain("Before you visit");
            expect(html, id).toContain("Do you take walk-ins?");
            expect(html, id).toContain("What is the dress code?");
            expect(html, id).toContain("vegetarian or Jain");
            expect(html, id).toContain("<summary");
            // Empty FAQ slots used to ship when props were q/a instead of question/answer.
            expect(html, id).not.toMatch(/<summary[^>]*>\s*<\/summary>/);
        }
    });
});
