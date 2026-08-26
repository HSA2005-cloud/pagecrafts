import { describe, expect, it } from "vitest";

import { createProject } from "@/lib/data/projects";
import { patchProjectContent } from "@/lib/data/project-content";
import { contentFromFiles } from "@/lib/content/from-files";
import type { ContentSchema } from "@/lib/contracts";
import { createFakeDb, type FakeDb } from "../support/fake-db";

// R3 D7 — a forked project owns its content, schema and values both.
//
// The files were always copied. The schema was not: it was read live through
// source_template_id every time somebody edited. These tests are about what that reference
// cost, and they are written as the situations rather than as the mechanism, because the
// mechanism is allowed to change and the situations are not.

const SCHEMA: ContentSchema = {
    sections: [
        {
            key: "hero",
            label: "Hero",
            fields: [
                { key: "headline", label: "Headline", type: "text", maxLength: 60 },
                { key: "image", label: "Photo", type: "image" },
            ],
        },
        {
            key: "menu",
            label: "Menu",
            fields: [
                { key: "heading", label: "Heading", type: "text", maxLength: 60 },
                {
                    key: "items",
                    label: "Cards",
                    type: "list",
                    itemSchema: [
                        { key: "title", label: "Title", type: "text" },
                        { key: "body", label: "Body", type: "text" },
                    ],
                },
            ],
        },
    ],
};

const INDEX_HTML = `<!doctype html>
<main>
  <section class="hero">
    <h1 data-slot="hero.headline">Good food. Good mood.</h1>
    <div class="hero-frame" data-slot="hero.image"><img src="https://images.example/x.jpg" alt="A room" /></div>
  </section>
  <section class="section">
    <h2 data-slot="menu.heading">On the menu</h2>
    <ul class="cards">
      <li class="card">
        <h3 data-slot="menu.items.0.title">To start</h3>
        <p data-slot="menu.items.0.body">Small plates &amp; a glass.</p>
      </li>
      <li class="card">
        <h3 data-slot="menu.items.1.title">Mains</h3>
        <p data-slot="menu.items.1.body">From the fire.</p>
      </li>
    </ul>
  </section>
</main>`;

const FILES = { "index.html": INDEX_HTML, "styles.css": ".hero{}" };

function libraryWithDesign() {
    const db = createFakeDb({ users: [{ id: "u1" }] });
    const template = db.insert("templates", {
        name: "Restaurant",
        description: "A warm, dark restaurant site.",
        files: FILES,
        content_schema: SCHEMA,
    });
    return { db, templateId: template.id as string };
}

describe("reading the starting content out of the markup", () => {
    it("takes the words that are actually on the page", () => {
        const content = contentFromFiles(FILES, SCHEMA) as Record<string, Record<string, unknown>>;

        expect(content.hero.headline).toBe("Good food. Good mood.");
        expect(content.menu.heading).toBe("On the menu");
    });

    it("keeps cards in the order the page shows them", () => {
        const content = contentFromFiles(FILES, SCHEMA) as Record<string, Record<string, unknown>>;

        expect(content.menu.items).toEqual([
            { title: "To start", body: "Small plates & a glass." },
            { title: "Mains", body: "From the fire." },
        ]);
    });

    it("leaves an image slot alone rather than putting a URL where an asset id goes", () => {
        // content_json holds an asset id for an image. Writing the template's URL there
        // would seed a value the field's own schema rejects, and the next save of any other
        // field would fail validation on a value the person never typed.
        const content = contentFromFiles(FILES, SCHEMA) as Record<string, Record<string, unknown>>;

        expect(content.hero).not.toHaveProperty("image");
    });

    it("ignores a slot the schema does not know about", () => {
        // The panel is generated from the schema, so a value it cannot render is a value
        // nobody can see or correct.
        const stray = { "index.html": '<p data-slot="ghost.field">Boo</p>' };

        expect(contentFromFiles(stray, SCHEMA)).toEqual({});
    });
});

// Counts round trips without touching the shared fake: every .from() and .rpc() is one
// call to the database, and latency is per call.
function counting(client: ReturnType<FakeDb["asUser"]>) {
    let calls = 0;
    const proxy = new Proxy(client as unknown as Record<string, unknown>, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if ((prop === "from" || prop === "rpc") && typeof value === "function") {
                return (...args: unknown[]) => {
                    calls += 1;
                    return (value as (...a: unknown[]) => unknown).apply(target, args);
                };
            }
            return value;
        },
    });
    return { client: proxy as unknown as ReturnType<FakeDb["asUser"]>, calls: () => calls };
}

describe("forking a design", () => {
    // The plan gives fork a two-second budget. Wall-clock here would measure the fake, which
    // is instant and proves nothing. What can be checked is the shape of the cost: a fork
    // must not cost one round trip per file, because that is the version that comes in
    // under two seconds on a three-file design in the fake and nowhere near it on a
    // forty-file design against a real database.
    it("costs the same number of round trips whatever the design's size", async () => {
        const small = libraryWithDesign();
        const big = libraryWithDesign();
        const manyFiles: Record<string, string> = { "index.html": INDEX_HTML };
        for (let i = 0; i < 40; i++) manyFiles[`page-${i}.html`] = `<p>page ${i}</p>`;
        big.db.rows("templates")[0]!.files = manyFiles;

        const a = counting(small.db.asUser("u1"));
        await createProject(a.client, "u1", { name: "Small", sourceTemplateId: small.templateId });

        const b = counting(big.db.asUser("u1"));
        await createProject(b.client, "u1", { name: "Big", sourceTemplateId: big.templateId });

        expect(b.calls()).toBe(a.calls());
    });

    it("writes the brief onto the same design and adds About, Contact and Settings", async () => {
        const { db, templateId } = libraryWithDesign();
        db.rows("templates")[0]!.files = {
            "index.html": `<!doctype html>
<html>
  <head><title>Restaurant</title><link rel="stylesheet" href="styles.css" /></head>
  <body>
    <header class="topbar">
      <span class="wordmark" data-slot="site.name">Restaurant</span>
      <nav class="nav"><a href="#menu">Menu</a></nav>
    </header>
    <h1 data-slot="hero.headline">Good food. Good mood.</h1>
    <footer class="footer"><p data-slot="site.footer">Built with PageCraft.</p></footer>
  </body>
</html>`,
            "styles.css": ".hero{}",
        };

        const { id } = await createProject(db.asUser("u1"), "u1", {
            name: "Kettle & Co.",
            sourceTemplateId: templateId,
            brief: {
                name: "Kettle & Co.",
                profession: "Cafe",
                offer: "Tea and cakes",
                place: "Pune",
                phone: "0201234567",
            },
        });

        const project = db.rows("projects").find((p) => p.id === id)!;
        const files = db.rows("project_files").filter((row) => row.project_id === id);
        const paths = files.map((row) => row.path as string).sort();

        expect(paths).toEqual(expect.arrayContaining([
            "index.html",
            "about.html",
            "contact.html",
            "settings.html",
            "styles.css",
        ]));
        expect(files.find((row) => row.path === "index.html")?.content).toContain("Kettle &amp; Co.");
        expect(files.find((row) => row.path === "about.html")?.content).toContain("Tea and cakes in Pune");
        expect((project.content_schema as ContentSchema).sections.map((s) => s.key))
            .toContain("aboutPage");
    });

    it("gives the project its own copy of the schema and the words", async () => {
        const { db, templateId } = libraryWithDesign();

        const { id } = await createProject(db.asUser("u1"), "u1", {
            name: "Kettle & Co.",
            sourceTemplateId: templateId,
        });

        const project = db.rows("projects").find((p) => p.id === id)!;
        expect((project.content_schema as ContentSchema).sections.map((s) => s.key))
            .toEqual(["hero", "menu"]);
        expect((project.content_json as Record<string, Record<string, unknown>>).hero.headline)
            .toBe("Good food. Good mood.");
    });

    it("starts with enough site_meta for publish to emit real tags", async () => {
        // A site that publishes with no <title> is one nobody finds, and its owner has no
        // reason to suspect it. Both values are theirs to change; neither may be absent.
        const { db, templateId } = libraryWithDesign();

        const { id } = await createProject(db.asUser("u1"), "u1", {
            name: "Kettle & Co.",
            sourceTemplateId: templateId,
        });

        expect(db.rows("projects").find((p) => p.id === id)!.site_meta).toEqual({
            title: "Kettle & Co.",
            description: "A warm, dark restaurant site.",
        });
    });

    it("can still be edited after the design it came from is retired", async () => {
        // The regression this whole change exists for. source_template_id is
        // `on delete set null`, so removing a design from the library used to take the
        // schema with it and leave the owner with a site they could not edit a word of.
        const { db, templateId } = libraryWithDesign();
        const { id } = await createProject(db.asUser("u1"), "u1", {
            name: "Kettle & Co.",
            sourceTemplateId: templateId,
        });

        db.rows("templates").length = 0;
        const project = db.rows("projects").find((p) => p.id === id)!;
        project.source_template_id = null;

        await expect(
            patchProjectContent(db.asUser("u1"), id, [
                { path: "hero.headline", value: "Kettle & Co." },
            ]),
        ).resolves.toMatchObject({ rendered: true });

        expect((db.rows("projects").find((p) => p.id === id)!.content_json as Record<string, Record<string, unknown>>)
            .hero.headline).toBe("Kettle & Co.");
    });

    it("is unaffected when the library design's schema changes later", async () => {
        // Re-normalising a design must not change what an existing project validates
        // against, because that project's files still hold the old shape.
        const { db, templateId } = libraryWithDesign();
        const { id } = await createProject(db.asUser("u1"), "u1", {
            name: "Kettle & Co.",
            sourceTemplateId: templateId,
        });

        db.rows("templates")[0]!.content_schema = { sections: [] };

        await expect(
            patchProjectContent(db.asUser("u1"), id, [
                { path: "menu.heading", value: "Today" },
            ]),
        ).resolves.toMatchObject({ rendered: true });
    });
});
