import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lookTierSite } from "@/lib/demos/look-tiers";

const GALLERY_PATHS = [
    "/compare-gallery/dining-hall.jpg",
    "/compare-gallery/grand-salon.jpg",
    "/compare-gallery/crystal-room.jpg",
];

describe("Compare gallery photos", () => {
    it("ships the three dining photos on Free, Pro, and Premium", () => {
        for (const id of ["starter", "pro", "premium"] as const) {
            const site = lookTierSite(id);
            const html = Object.values(site.files).join("\n");
            for (const path of GALLERY_PATHS) {
                expect(html, `${id} missing ${path}`).toContain(path);
            }
            expect(html).toMatch(/Bright dining hall|Grand salon|Crystal room/);
            expect(html).not.toMatch(/>Plate</);
        }
    });

    it("keeps Free gallery image slots visible (not caption-only)", () => {
        const css = readFileSync(join(process.cwd(), "src/lib/ai/generate/to-files.ts"), "utf8");
        expect(css).not.toMatch(
            /\[data-style="casual"\] \[data-type="gallery"\] \.img-slot \{ display: none/,
        );
        const starter = lookTierSite("starter").files["gallery.html"] ?? "";
        expect(starter).toContain("<img src=");
        expect(starter).toContain("/compare-gallery/dining-hall.jpg");
    });

    it("stores the gallery assets in public/", () => {
        for (const name of ["dining-hall.jpg", "grand-salon.jpg", "crystal-room.jpg"]) {
            const bytes = readFileSync(join(process.cwd(), "public/compare-gallery", name));
            expect(bytes.byteLength).toBeGreaterThan(10_000);
        }
    });
});
