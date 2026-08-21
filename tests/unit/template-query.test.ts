import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TEMPLATES } from "@/lib/templates";
import { parseTemplateQuery, queryTemplates } from "@/lib/templates/query";
import { renderedThumbnailIds, thumbnailUrlFor } from "@/lib/templates/thumbnails";

const params = (search: string) => new URLSearchParams(search);
const parse = (search: string) => parseTemplateQuery(params(search));
const run = (search: string) => queryTemplates(parse(search));
const names = (search: string) => run(search).items.map((t) => t.name);

describe("parseTemplateQuery", () => {
  it("reads every filter the gallery offers", () => {
    expect(
      parse("category=store&colour=dark&layout=split&feature=form&tier=free&q=shop&sort=name"),
    ).toMatchObject({
      category: "store",
      colour: "dark",
      layout: "split",
      feature: "form",
      tier: "free",
      q: "shop",
      sort: "name",
    });
  });

  it("drops what it does not recognise instead of refusing it (D-4, FR-035)", () => {
    const query = parse("category=__proto__&colour=chartreuse&layout=diagonal&tier=cheap&feature=magic");

    expect(query).toEqual({ sort: "recommended" });
  });

  it("defaults to the recommended order", () => {
    expect(parse("").sort).toBe("recommended");
    expect(parse("sort=random").sort).toBe("recommended");
  });

  it("caps the search text rather than letting a long URL through", () => {
    expect(parse(`q=${"x".repeat(500)}`).q).toHaveLength(100);
  });

  it("reads the classifier's attributes as an intent, not a filter", () => {
    expect(parse("intent=food&tone=warm&palette=dark").intent).toEqual({
      category: "food",
      tone: "warm",
      palette: "dark",
    });
  });
});

describe("queryTemplates", () => {
  it("returns the whole library and its size when nothing is asked for", () => {
    const { items, total } = run("");
    expect(items).toHaveLength(TEMPLATES.length);
    expect(total).toBe(TEMPLATES.length);
  });

  it("reports the library's size in total even when filtered, for 'N of M'", () => {
    expect(run("tier=signature").total).toBe(TEMPLATES.length);
  });

  it("filters on what a design actually is, not on what it is tagged", () => {
    // colour, layout and features are read from the design's own files, so a design cannot
    // be filtered into a capability it does not have.
    for (const item of run("feature=form").items) expect(item.features).toContain("form");
    for (const item of run("colour=dark").items) expect(item.colour).toBe("dark");
    for (const item of run("layout=centered").items) expect(item.layout).toBe("centered");
  });

  it("combines filters", () => {
    const free = run("tier=free").items.length;
    const freeDark = run("tier=free&colour=dark").items.length;

    expect(freeDark).toBeLessThanOrEqual(free);
    for (const item of run("tier=free&colour=dark").items) {
      expect(item.tier).toBe("free");
      expect(item.colour).toBe("dark");
    }
  });

  it("narrows on each extra search word", () => {
    expect(names("q=shop")).toContain("Shop");
    expect(names("q=shop%20nonsense")).toEqual([]);
  });

  it("answers an impossible combination with nothing, not an error", () => {
    // Taken from the library rather than hard-coded. This was `category=store&colour=dark`,
    // which stopped being impossible the moment the store bucket gained a dark design — a
    // hard-coded pair quietly turns into a no-op the batch after someone fills it in.
    //
    // It has to be a category the library ships, paired with a colour none of its designs
    // have: an unrecognised category is dropped rather than refused, so it widens the
    // gallery to everything instead of narrowing it to nothing.
    const all = run("").items;
    const categories = [...new Set(all.map((t) => t.category))];
    const colours = [...new Set(all.map((t) => t.colour))];

    const empty = categories
      .flatMap((category) => colours.map((colour) => ({ category, colour })))
      .find(({ category, colour }) =>
        !all.some((t) => t.category === category && t.colour === colour));

    expect(empty).toBeDefined();
    expect(run(`category=${empty!.category}&colour=${empty!.colour}`).items).toEqual([]);

    // And a three-way narrowing nothing satisfies.
    const emptyPaid = all
      .map((t) => ({ category: t.category, colour: t.colour, tier: "signature" as const }))
      .find(({ category, colour, tier }) =>
        !all.some((t) => t.category === category && t.colour === colour && t.tier === tier));
    expect(emptyPaid).toBeDefined();
    expect(
      run(`category=${emptyPaid!.category}&tier=signature&colour=${emptyPaid!.colour}`).items,
    ).toEqual([]);
  });

  it("prices every item, and never invents a price for a free design", () => {
    for (const item of run("").items) {
      expect(item.priceInr).toBe({ free: 0, premium: 499, signature: 999 }[item.tier]);
    }
  });

  it("scores zero across the board when nothing was described", () => {
    expect(run("").items.every((t) => t.score === 0)).toBe(true);
  });

  it("orders by score under the recommended sort, highest first", () => {
    const scores = run("intent=store&tone=warm&palette=light").items.map((t) => t.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("awards the vertical match from the URL (TC-118)", () => {
    const items = run("vertical=dental-clinic").items;
    expect(items[0]!.id).toBe("dental-clinic");
    expect(items[0]!.score).toBeGreaterThanOrEqual(100);
  });

  it("keeps the score on every item even when an explicit sort reorders them", () => {
    const items = run("intent=store&sort=name").items;
    expect(items.find((t) => t.id === "shop")!.score).toBeGreaterThan(0);
  });

  it("is deterministic — same query, same order (D-5)", () => {
    const once = names("intent=food&tone=warm&palette=dark");
    const twice = names("intent=food&tone=warm&palette=dark");
    expect(twice).toEqual(once);
  });

  it("does not reorder the registry in place", () => {
    const before = TEMPLATES.map((t) => t.id);
    run("sort=name");
    run("intent=store");
    expect(TEMPLATES.map((t) => t.id)).toEqual(before);
  });
});

// The regression the browser caught on the day: `q` means the person's description in the
// gallery's URL and a text search to the API. Feeding one into the other filtered thirteen
// designs down to one, because every word of "a small online shop" happened to appear in a
// single design's description. The page keeps them apart; this keeps it that way.
describe("a description is not a search", () => {
  it("would filter the library to almost nothing if it were used as one", () => {
    expect(names("q=a%20small%20online%20shop").length).toBeLessThan(TEMPLATES.length);
  });

  // 20s rather than the default 5s. The import below pulls in the gallery page and, with
  // it, the whole template library and its preview parser — cheap once warm and slow on a
  // cold module graph. Under a full-suite run on a loaded machine it crossed 5s and failed
  // this test intermittently, which taught everyone to re-run rather than to read it. The
  // assertions are unchanged; only the patience is.
  it("so the gallery hands the query layer `search`, and never the description", { timeout: 20_000 }, async () => {
    const page = await import("@/app/templates/page");
    expect(page.default).toBeTypeOf("function");

    // The page's own params: `q` is the description, `search` is the search box.
    const url = new URLSearchParams("q=a+small+online+shop&search=shop&intent=store");
    const forQuery = new URLSearchParams(url);
    forQuery.delete("q");
    const text = url.get("search");
    if (text) forQuery.set("q", text);

    const query = parseTemplateQuery(forQuery);
    expect(query.q).toBe("shop");
    expect(query.intent).toEqual({ category: "store" });
  });
});

describe("thumbnails", () => {
  // The rule has not changed since the field was null for everything: advertise a thumbnail
  // only when there is one. What changed at R2 D18 is that there are 115 of them.

  it("advertises a thumbnail for a design that has been rendered", () => {
    expect(thumbnailUrlFor({ id: "shop" })).toBe("/templates/shop.webp");
    expect(run("").items.every((t) => t.thumbnailUrl !== null)).toBe(true);
  });

  it("still advertises nothing for a design nobody has rendered", () => {
    // A URL that 404s is worse than none, because a caller will render it. This is what
    // makes adding a design without re-running the renderer degrade to the parsed miniature
    // instead of showing a page of broken images.
    expect(thumbnailUrlFor({ id: "not-a-real-design" })).toBeNull();
  });

  it("points at a file that exists", () => {
    // The manifest and the directory are written by the same script, and this is the check
    // that they were not allowed to drift — a manifest listing a design whose file was never
    // written is precisely the 404 the null was protecting against.
    for (const id of renderedThumbnailIds()) {
      expect(
        existsSync(join(process.cwd(), "public", "templates", `${id}.webp`)),
        `public/templates/${id}.webp is missing`,
      ).toBe(true);
    }
  });

  it("renders one for every design in the library", () => {
    const rendered = new Set(renderedThumbnailIds());
    const missing = TEMPLATES.filter((t) => !rendered.has(t.id)).map((t) => t.id);
    expect(missing).toEqual([]);
  });

  it("keeps the record's own thumbnailUrl pointing at the same file", () => {
    // Template.thumbnailUrl is what a direct reader of the library sees. It advertised
    // `/templates/<id>/thumbnail.png` for months and no such file was ever produced.
    for (const template of TEMPLATES) {
      expect(template.thumbnailUrl, template.id).toBe(`/templates/${template.id}.webp`);
    }
  });
});
