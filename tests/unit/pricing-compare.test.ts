import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lookTierPreviewHtml, COMPARE_LOOKS, DEMO_BRAND } from "@/lib/demos/look-tiers";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("pricing and compare marketing pages", () => {
    it("keeps one public price story — Starter / Pro / Premium plans", () => {
        const page = read("src", "components", "marketing", "PricingGuide.tsx");
        const publicPricing = read("src", "app", "pricing", "page.tsx");
        const slide = read("src", "components", "deck", "PricingSlide.tsx");
        expect(page).toContain("Starter, Pro, or");
        expect(page).toContain("Starter vs Pro vs Premium");
        expect(page).toContain("Casual");
        expect(page).toContain("Photo-rich");
        expect(page).toContain("Animated");
        expect(page).toContain("every design");
        expect(page).toContain("marked for that plan");
        expect(page).not.toContain("Two kinds of price");
        expect(page).not.toContain("do not mix");
        expect(page).not.toContain("Free / Advanced");
        expect(page).toContain("scrollToDeckSlide");
        expect(page).toContain('scrollToDeckSlide("compare")');
        expect(page).toContain("Upgrade your plan");
        expect(publicPricing).toContain('redirect("/plans")');
        expect(slide).toContain("signedIn");
    });

    it("ships live Starter / Pro / Premium previews from the real generators", () => {
        expect(COMPARE_LOOKS.map((l) => l.id)).toEqual(["starter", "pro", "premium"]);
        expect(COMPARE_LOOKS.map((l) => l.styleId)).toEqual(["casual", "photos", "motion"]);
        expect(COMPARE_LOOKS.map((l) => l.label)).toEqual(["Starter", "Pro", "Premium"]);
        const starter = lookTierPreviewHtml("starter");
        const pro = lookTierPreviewHtml("pro");
        const premium = lookTierPreviewHtml("premium");
        expect(starter).toContain('data-style="casual"');
        expect(starter).toContain("site-header");
        expect(starter).toContain(DEMO_BRAND.name);
        expect(starter).toContain("<img src=");
        expect(starter).toContain("images.unsplash.com");
        expect(pro).toContain('data-style="photos"');
        expect(pro).toContain("image-bg");
        expect(pro).toContain("--page-photo");
        expect(pro).toContain("--pc-bg-shift");
        expect(pro).toContain("pc-page-ready");
        expect(pro).toContain("<img src=");
        expect(premium).toContain('data-style="motion"');
        expect(premium).toContain("site-liquid");
        expect(premium).toContain("liquid-slide");
        expect(premium).toContain("motion-stage");
        expect(premium).toContain('data-motion="kinetic"');
        expect(starter).not.toContain("Loom");
        expect(pro).not.toContain("cloth brand");
    });

    it("does not lock home deck slides with scroll-snap-stop always", () => {
        const css = read("src", "app", "globals.css");
        expect(css).toContain("scroll-snap-stop: normal");
        expect(css).not.toContain("scroll-snap-stop: always");
    });

    it("keeps AI rebuild limits off the public compare pitch", () => {
        const compare = read("src", "components", "marketing", "LookCompareDemo.tsx");
        expect(compare).not.toContain("Advanced AI packages");
        expect(compare).not.toContain("Free /");
        expect(compare).toContain("See all pricing");
    });
});
