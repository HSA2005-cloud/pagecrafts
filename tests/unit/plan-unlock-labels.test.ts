import { describe, expect, it } from "vitest";

import {
    styleTileLabel,
    templateTileLabel,
} from "@/lib/payments/pricing";
import { planCovers } from "@/lib/payments/plans";

describe("plan unlock tile labels", () => {
    it("shows Free for starter templates and covered Pro designs", () => {
        expect(templateTileLabel("free")).toBe("Free");
        expect(templateTileLabel("premium", { unlocked: false })).toBe("Pro");
        expect(templateTileLabel("premium", { unlocked: true })).toBe("Free");
        expect(templateTileLabel("signature", { unlocked: true })).toBe("Free");
    });

    it("shows Pro unlocked / Premium unlocked for covered looks", () => {
        expect(styleTileLabel("free")).toBe("Free");
        expect(styleTileLabel("pro", { unlocked: false })).toBe("Pro");
        expect(styleTileLabel("pro", { unlocked: true })).toBe("Pro unlocked");
        expect(styleTileLabel("premium", { unlocked: true })).toBe("Premium unlocked");
        expect(styleTileLabel("premium", { unlocked: false })).toBe("Premium");
    });

    it("treats Pro as covering Pro templates and Photo-rich, Premium as covering all", () => {
        expect(planCovers("pro", "pro")).toBe(true);
        expect(planCovers("pro", "premium")).toBe(false);
        expect(planCovers("premium", "pro")).toBe(true);
        expect(planCovers("premium", "premium")).toBe(true);
        expect(planCovers("starter", "pro")).toBe(false);
    });
});
