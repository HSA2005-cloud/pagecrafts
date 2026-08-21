import { describe, expect, it } from "vitest";

import { TEMPLATES } from "@/lib/templates";
import {
    CATEGORY_ALIASES,
    CATEGORY_CARDS,
    CATEGORY_LABELS,
    filterByCategory,
    toCategory,
} from "@/lib/discovery/categories";
import type { Category } from "@/lib/contracts";

// Category and tier coverage (R2 D17, Doc 22 P1).
//
// The intent screen is a promise: every card on it says "there is something here for you".
// A card behind which the library ships nothing breaks that promise outright, and a card
// behind which everything costs money breaks it more quietly — the person picked a shelf,
// browsed it, and found the only way forward is a payment. Doc 22 P1 says at least one free
// design per category, and until D17 nothing checked it. Two shelves were failing:
// `architecture` held one design at Rs 999 and `agency` one at Rs 499.
//
// These run over the real library rather than a fixture, so a design added or repriced
// later is measured the same way.

const designsIn = (category: Category) => TEMPLATES.filter((t) => t.category === category);

describe("every shelf a person can pick has something behind it", () => {
    it("ships at least one design for every card", () => {
        const empty = CATEGORY_CARDS.filter((c) => designsIn(c).length === 0);
        expect(empty).toEqual([]);
    });

    it("ships a free (light) design on every shelf that has one, and never a dark Free tile", () => {
        // Product rule updated: Free = white/casual only. Dark shelves may be Pro-only.
        // Still require that every *card that includes a light design* exposes it as free.
        const lightPaid = TEMPLATES.filter((t) => {
            const bg = t.files["styles.css"]?.match(/--bg:\s*([^;]+)/)?.[1]?.trim() ?? "";
            const hex = bg.replace("#", "");
            const r = Number.parseInt(hex.slice(0, 2), 16);
            const g = Number.parseInt(hex.slice(2, 4), 16);
            const b = Number.parseInt(hex.slice(4, 6), 16);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance >= 0.55 && t.tier !== "free";
        });
        expect(lightPaid.map((t) => t.id)).toEqual([]);

        const darkFree = TEMPLATES.filter((t) => {
            const bg = t.files["styles.css"]?.match(/--bg:\s*([^;]+)/)?.[1]?.trim() ?? "";
            const hex = bg.replace("#", "");
            const r = Number.parseInt(hex.slice(0, 2), 16);
            const g = Number.parseInt(hex.slice(2, 4), 16);
            const b = Number.parseInt(hex.slice(4, 6), 16);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance < 0.55 && t.tier === "free";
        });
        expect(darkFree.map((t) => t.id)).toEqual([]);
    });

    it("does not strand a design on a shelf nobody can filter to", () => {
        // The other direction, and the one that actually happened once: `store` had fourteen
        // designs while being absent from the cards, so the gallery's whole e-commerce shelf
        // was unreachable.
        //
        // Carded, not merely aliased. An alias redirects the *filter*, so a design stored
        // under `agency` would be hidden by the very redirect that makes ?category=agency
        // work — the filter resolves to `business` and matches on the stored value, which is
        // still `agency`. Invisible on every shelf. The design's own category has to be one
        // the gallery actually shows.
        const carded = new Set<string>(CATEGORY_CARDS);
        const stranded = [...new Set(TEMPLATES.map((t) => t.category))].filter((c) => !carded.has(c));
        expect(stranded).toEqual([]);
    });

    it("gives every card a label to show", () => {
        for (const c of CATEGORY_CARDS) {
            expect(CATEGORY_LABELS[c]?.trim(), c).toBeTruthy();
        }
    });
});

describe("the shelves folded at D17", () => {
    it("lands an old link on the shelf its designs moved to", () => {
        // A bookmarked ?category=retail must still filter. Resolving it to undefined would
        // silently show the whole library, which looks to the person like the filter was
        // ignored rather than redirected.
        expect(toCategory("retail")).toBe("store");
        expect(toCategory("agency")).toBe("business");
        expect(toCategory("wellness")).toBe("health_wellness");
        expect(toCategory("health")).toBe("health_wellness");
    });

    it("leaves nothing behind on a folded shelf", () => {
        for (const folded of Object.keys(CATEGORY_ALIASES) as Category[]) {
            expect(designsIn(folded), `${folded} still has designs`).toEqual([]);
        }
    });

    it("takes the folded shelves off the intent screen", () => {
        for (const folded of Object.keys(CATEGORY_ALIASES) as Category[]) {
            expect(CATEGORY_CARDS).not.toContain(folded);
        }
    });

    it("points every fold at a shelf that is itself carded", () => {
        // A fold into a shelf that was also folded, or into one with no card, would move the
        // designs somewhere the person still cannot reach.
        for (const [from, to] of Object.entries(CATEGORY_ALIASES)) {
            expect(CATEGORY_CARDS, `${from} -> ${to}`).toContain(to);
        }
    });

    it("actually shows the moved designs on the destination shelf", () => {
        // The end-to-end version: follow the old link the way the gallery does and check the
        // bookshop is in the result.
        const shelf = filterByCategory(TEMPLATES, toCategory("retail"));
        expect(shelf.map((t) => t.id)).toContain("bookstore");
        expect(shelf.map((t) => t.id)).toContain("florist");
    });
});

describe("what a person is asked to pay for", () => {
    it("keeps light / casual designs Free and dark designs Pro or Premium", () => {
        // Product rule: white-background casual tiles are Free; dark tiles are the
        // paid shelf (Pro = premium, Premium = signature).
        for (const t of TEMPLATES) {
            const bg = t.files["styles.css"]?.match(/--bg:\s*([^;]+)/)?.[1]?.trim() ?? "";
            const hex = bg.replace("#", "");
            const r = Number.parseInt(hex.slice(0, 2), 16);
            const g = Number.parseInt(hex.slice(2, 4), 16);
            const b = Number.parseInt(hex.slice(4, 6), 16);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            const light = luminance >= 0.55;
            if (light) {
                expect(t.tier, `${t.id} is light so it must be free`).toBe("free");
                expect(t.priceInr, t.id).toBe(0);
            } else {
                expect(t.tier, `${t.id} is dark so it must be paid`).not.toBe("free");
                expect(t.priceInr, t.id).toBeGreaterThan(0);
            }
        }
    });

    it("prices a free design at nothing at all", () => {
        // "Rs 0" would invent a transaction. priceLine already returns null for free, and
        // this checks the data behind it rather than the formatting.
        for (const t of TEMPLATES.filter((x) => x.tier === "free")) {
            expect(t.priceInr, t.id).toBe(0);
        }
    });
});
