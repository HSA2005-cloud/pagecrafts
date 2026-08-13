import { describe, expect, it } from "vitest";

import { applyContentOps, validateFieldValue } from "@/lib/content/apply-ops";
import type { ContentSchema, Field } from "@/lib/contracts";

// R2 D9 — the panel refuses what the route would refuse, using the route's own rules.
//
// The point of exporting validateFieldValue rather than writing a second validator for the
// client is that the two cannot disagree. These tests are mostly about that property: the
// same function, asked the same question, from both sides.

const HEADLINE: Field = { key: "headline", label: "Headline", type: "text", maxLength: 10 };
const ACCENT: Field = { key: "accent", label: "Accent", type: "color" };
const LAYOUT: Field = { key: "layout", label: "Layout", type: "select", options: ["a", "b"] };
const PHOTO: Field = { key: "image", label: "Photo", type: "image" };
const CARDS: Field = {
    key: "items",
    label: "Cards",
    type: "list",
    itemSchema: [
        { key: "title", label: "Title", type: "text", maxLength: 5 },
        { key: "body", label: "Body", type: "text" },
    ],
};

const SCHEMA: ContentSchema = {
    sections: [{ key: "hero", label: "Hero", fields: [HEADLINE, ACCENT, LAYOUT, PHOTO, CARDS] }],
};

describe("every FieldType says yes or why not", () => {
    it("accepts text within its cap and refuses text over it", () => {
        expect(validateFieldValue(HEADLINE, "short")).toBeNull();
        expect(validateFieldValue(HEADLINE, "a".repeat(11))).toContain("limit is 10");
    });

    it("wants a hex colour, not a colour name", () => {
        expect(validateFieldValue(ACCENT, "#1a2b3c")).toBeNull();
        expect(validateFieldValue(ACCENT, "red")).toContain("hex colour");
    });

    it("only accepts an option the design actually offers", () => {
        expect(validateFieldValue(LAYOUT, "a")).toBeNull();
        expect(validateFieldValue(LAYOUT, "c")).toContain("Expected one of");
    });

    it("takes an asset id or null for an image, and nothing else", () => {
        expect(validateFieldValue(PHOTO, "https://cdn.example.test/a.png")).toBeNull();
        expect(validateFieldValue(PHOTO, null)).toBeNull();
        expect(validateFieldValue(PHOTO, 42)).toContain("asset id");
    });

    it("checks each cell of a list against its own field, cap included", () => {
        expect(validateFieldValue(CARDS, [{ title: "ok", body: "fine" }])).toBeNull();
        expect(validateFieldValue(CARDS, [{ title: "far too long", body: "fine" }]))
            .toContain("limit is 5");
    });

    it("names the item that is wrong, not just the list", () => {
        // "Something in your cards is too long" is not a thing anybody can act on.
        const message = validateFieldValue(CARDS, [
            { title: "ok", body: "fine" },
            { title: "much too long", body: "fine" },
        ]);

        expect(message).toContain("Item 2");
    });

    it("refuses a scalar where a list belongs, and the reverse", () => {
        expect(validateFieldValue(CARDS, "not a list")).toContain("array");
        expect(validateFieldValue(HEADLINE, ["not text"])).toContain("Expected text");
    });
});

describe("the panel and the route cannot disagree", () => {
    // The property that matters more than any single rule above: whatever the panel accepts,
    // the write path accepts, because it is one function and not two.
    const cases: { field: Field; value: unknown }[] = [
        { field: HEADLINE, value: "fine" },
        { field: HEADLINE, value: "a".repeat(11) },
        { field: ACCENT, value: "red" },
        { field: LAYOUT, value: "c" },
        { field: CARDS, value: [{ title: "far too long", body: "x" }] },
        { field: PHOTO, value: 42 },
    ];

    for (const { field, value } of cases) {
        it(`agrees about ${field.key} = ${JSON.stringify(value).slice(0, 20)}`, () => {
            const panelSaysNo = validateFieldValue(field, value) !== null;
            const routeSaysNo =
                applyContentOps({}, [{ path: `hero.${field.key}`, value }], SCHEMA).issues.length > 0;

            expect(panelSaysNo).toBe(routeSaysNo);
        });
    }
});
