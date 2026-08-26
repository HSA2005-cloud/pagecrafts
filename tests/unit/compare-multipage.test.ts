import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lookTierPreviewHtml, lookTierSite } from "@/lib/demos/look-tiers";

describe("Compare multipage live preview", () => {
    it("ships every AI-generated HTML page for Starter, not only Home", () => {
        const site = lookTierSite("starter");
        expect(Object.keys(site.files).sort()).toEqual([
            "about.html",
            "contact.html",
            "faq.html",
            "gallery.html",
            "index.html",
            "menu.html",
            "services.html",
            "settings.html",
        ]);
        expect(site.nav.map((p) => p.label)).toEqual([
            "Home",
            "About",
            "Services",
            "Menu",
            "Gallery",
            "Contact",
            "Settings",
            "FAQ",
        ]);
        expect(site.files["about.html"]).toMatch(/Our house|About/i);
        expect(site.files["contact.html"]).toMatch(/Reserve|Contact|1522/i);
        expect(site.files["settings.html"]).toMatch(/settings/i);
    });

    it("wraps the live frame in a shell that keeps .html links inside the iframe", () => {
        const html = lookTierPreviewHtml("starter");
        expect(html).toContain('id="pc-view"');
        expect(html).toContain("pc-compare-go");
        expect(html).toContain("about.html");
        expect(html).toContain("settings.html");
        // Must not be a lone index that would navigate the parent to pagecrafts.in/about.html
        expect(html).toContain("var PAGES =");
        expect(html).toContain("nodeType===3");
        expect(html).toContain("parent !== window");
    });

    it("lets the Compare sidebar drive page switches", () => {
        const source = readFileSync(
            join(process.cwd(), "src/components/marketing/LookCompareDemo.tsx"),
            "utf8",
        );
        expect(source).toContain("pc-compare-nav");
        expect(source).toContain("openPage");
        expect(source).toContain("lookTierSite");
        expect(source).toContain("site.nav.map");
    });
});
