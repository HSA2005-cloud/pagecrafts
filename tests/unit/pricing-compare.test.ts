import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lookTierPreviewHtml, lookTierSite, COMPARE_LOOKS, DEMO_BRAND } from "@/lib/demos/look-tiers";

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
        const starterSite = lookTierSite("starter");
        const proSite = lookTierSite("pro");
        const premiumSite = lookTierSite("premium");
        const starterHome = starterSite.files["index.html"] ?? "";
        const proHome = proSite.files["index.html"] ?? "";
        const premiumHome = premiumSite.files["index.html"] ?? "";
        const starterShell = lookTierPreviewHtml("starter");
        expect(starterShell).toContain("pc-view");
        expect(starterShell).toContain("about.html");
        expect(starterHome).toContain('data-style="casual"');
        expect(starterHome).toContain("site-header");
        expect(starterHome).toContain(DEMO_BRAND.name);
        expect(starterHome).toContain("<img src=");
        expect(starterHome).toContain("images.unsplash.com");
        expect(proHome).toContain('data-style="photos"');
        expect(proHome).toContain("image-bg");
        expect(proHome).toContain("--page-photo");
        expect(proHome).toContain("--pc-bg-shift");
        expect(proHome).toContain("pc-page-ready");
        expect(proHome).toContain("<img src=");
        expect(premiumHome).toContain('data-style="motion"');
        expect(premiumHome).toContain("site-liquid");
        expect(premiumHome).toContain("liquid-slide");
        expect(premiumHome).toContain("motion-stage");
        expect(premiumHome).toContain('data-motion="kinetic"');
        expect(starterHome).not.toContain("Loom");
        expect(proHome).not.toContain("cloth brand");
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

    it("uses plain Free / Pro / Premium badges — no unlocked copy, no red lock pill", () => {
        const compare = read("src", "components", "marketing", "LookCompareDemo.tsx");
        expect(compare).not.toMatch(/return\s+"Pro unlocked"/);
        expect(compare).not.toMatch(/return\s+"Premium unlocked"/);
        expect(compare).not.toContain("brand-gradient");
        expect(compare).not.toMatch(/\bLock\b/);
        expect(compare).toContain('return "Free"');
        expect(compare).toContain('return "Pro"');
        expect(compare).toContain('return "Premium"');
        expect(compare).toContain("COMPARE_BADGE");
    });
});
