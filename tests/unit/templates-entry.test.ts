import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("the template library", () => {
  it("is an internal signed-in page, not a public catalogue", () => {
    const layout = read("src", "app", "templates", "layout.tsx");
    const page = read("src", "app", "templates", "page.tsx");
    const header = read("src", "components", "landing", "SiteHeader.tsx");

    expect(layout).toContain("viewer(");
    expect(layout).toContain("/signin?next=");
    expect(layout).toContain("/?slide=build");
    expect(layout).not.toContain('redirect("/?slide=build")');
    expect(page).not.toContain("redirect(");

    expect(header).not.toContain('href: "/templates"');
    expect(header).toContain('href: "/#build"');
  });

  it("opens from Build and returns there", () => {
    const build = read("src", "components", "deck", "BuildSlide.tsx");
    const page = read("src", "app", "templates", "page.tsx");
    const choose = read("src", "components", "discovery", "UseDesignButton.tsx");

    expect(build).toContain('href="/templates"');
    expect(build).toContain("Explore more");
    expect(page).toContain("Back to Build");
    expect(page).toContain('href="/#build"');
        expect(choose).toContain("/new?template=");
        expect(choose).toContain("cursor-pointer");
        expect(choose).not.toContain("/editor/");
  });
});
