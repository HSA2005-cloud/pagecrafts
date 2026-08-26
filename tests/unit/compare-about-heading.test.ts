import { describe, expect, it } from "vitest";
import { DEMO_BRAND, lookTierSite } from "@/lib/demos/look-tiers";

describe("Compare About heading", () => {
    it("uses the hotel name on Free, Pro, and Premium — not Our house", () => {
        const expected = `${DEMO_BRAND.name} – Fine Dining in ${DEMO_BRAND.place}`;
        for (const id of ["starter", "pro", "premium"] as const) {
            const site = lookTierSite(id);
            const html = Object.values(site.files).join("\n");
            expect(html, id).toContain(expected);
            expect(html, id).not.toContain("Our house");
        }
    });
});
