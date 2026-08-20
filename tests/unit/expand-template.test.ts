import { describe, expect, it } from "vitest";

import { expandTemplateSite } from "@/lib/content/expand-template";
import type { ContentSchema } from "@/lib/contracts";

const SCHEMA: ContentSchema = {
    sections: [
        {
            key: "hero",
            label: "Hero",
            fields: [
                { key: "headline", label: "Headline", type: "text", maxLength: 60 },
                { key: "subhead", label: "Subheading", type: "text", maxLength: 140 },
            ],
        },
        {
            key: "site",
            label: "Site",
            fields: [
                { key: "name", label: "Site name", type: "text", maxLength: 40 },
                { key: "footer", label: "Footer", type: "text", maxLength: 120 },
            ],
        },
    ],
};

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Gym</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body data-layout="split">
    <header class="topbar">
      <span class="wordmark" data-slot="site.name">Ironworks</span>
      <nav class="nav">
        <a href="#classes">Classes</a>
        <a href="#contact">Contact</a>
      </nav>
    </header>
    <section class="hero">
      <h1 data-slot="hero.headline">Ironworks</h1>
      <p data-slot="hero.subhead">Strength gym in Pune</p>
    </section>
    <footer class="footer">
      <p data-slot="site.footer">Ironworks · Pune</p>
    </footer>
  </body>
</html>`;

const FACTS = {
    name: "Ironworks",
    offer: "Strength gym and coaching",
    place: "Pune",
    phone: "9876543210",
    hours: "6am–9pm",
};

describe("expandTemplateSite", () => {
    it("keeps the homepage chrome and adds About, Contact and Settings", () => {
        const { files, schema } = expandTemplateSite(
            { "index.html": INDEX, "styles.css": "body{color:red}" },
            SCHEMA,
            FACTS,
        );

        expect(files["index.html"]).toContain("data-slot=\"hero.headline\"");
        expect(files["index.html"]).toContain("Ironworks");
        expect(files["index.html"]).toContain("href=\"about.html\"");
        expect(files["index.html"]).toContain("href=\"#classes\"");
        expect(files["styles.css"]).toContain("body{color:red}");
        expect(files["styles.css"]).toContain(".contact-grid");

        expect(files["about.html"]).toContain("About Ironworks");
        expect(files["about.html"]).toContain("Strength gym and coaching in Pune");
        expect(files["about.html"]).toContain("href=\"styles.css\"");
        expect(files["about.html"]).toContain("data-layout=\"split\"");

        expect(files["contact.html"]).toContain("9876543210");
        expect(files["contact.html"]).not.toContain("data-working-form");
        expect(files["contact.html"]).toContain("<form class=\"form\"");

        expect(files["settings.html"]).toContain("6am–9pm");
        expect(files["settings.html"]).toContain("aria-current=\"page\"");

        expect(schema.sections.map((section) => section.key)).toEqual([
            "hero",
            "site",
            "aboutPage",
            "contactPage",
            "settingsPage",
        ]);
    });

    it("does not replace a page the design already had", () => {
        const { files } = expandTemplateSite(
            {
                "index.html": INDEX,
                "about.html": "<p>Original about</p>",
                "styles.css": "body{}",
            },
            SCHEMA,
            FACTS,
        );

        expect(files["about.html"]).toBe("<p>Original about</p>");
        expect(files["contact.html"]).toContain("Contact");
    });
});
