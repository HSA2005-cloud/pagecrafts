import type { TemplateTier } from "@/lib/contracts";
import type { Colour, Feature, Layout, TemplateQuery } from "@/lib/templates/query";

// The filter vocabulary the chips offer, and the labels they wear (R2 D7).
//
// One list per filter, exported so lib/templates/query.ts parses exactly what the chips can
// produce. Keeping two lists in step by hand is how a chip ends up offering a value the
// parser drops on the floor: the chip highlights, the URL changes, the grid does not move,
// and nothing anywhere reports an error.
//
// The labels are the person's words rather than the code's. "full-bleed" is what the
// blueprint calls that layout; "Full bleed" is what someone browsing reads. `form` is a
// section kind; "Contact form" is the thing they are looking for.

export const COLOURS: readonly Colour[] = ["light", "dark"];
export const LAYOUTS: readonly Layout[] = ["split", "full-bleed", "centered", "showcase"];
export const FEATURES: readonly Feature[] = ["form", "list", "photo"];
export const TIERS: readonly TemplateTier[] = ["free", "premium", "signature"];

export const COLOUR_LABELS: Record<Colour, string> = {
    light: "Light",
    dark: "Dark",
};

export const LAYOUT_LABELS: Record<Layout, string> = {
    split: "Split",
    "full-bleed": "Full bleed",
    centered: "Centered",
    showcase: "Showcase",
};

export const FEATURE_LABELS: Record<Feature, string> = {
    form: "Contact form",
    list: "List",
    photo: "Photo",
};

// The same words PriceBadge uses on the tile. "Free" is a fact about the design rather than
// a price of zero, and the paid tiers are named by what they cost, because a chip reading
// "Premium" makes someone guess and a chip reading "Rs 499" does not (Doc 22 P1-P3).
export const TIER_LABELS: Record<TemplateTier, string> = {
    free: "Free",
    premium: "Pro",
    signature: "Premium",
};

/**
 * The feature values worth offering as chips.
 *
 * A chip earns its place by dividing the library. Today every design has a contact form, a
 * list and a hero photograph — all 115 of them, one single feature set between them — so
 * each of `form`, `list` and `photo` returns the whole gallery. Three controls that look
 * like filters and cannot filter, which is worse than three fewer controls: someone presses
 * one, nothing moves, and they learn to distrust the rest of the row.
 *
 * Computed rather than deleted, so the row returns of its own accord the day a design ships
 * without a form. The `feature=` parameter itself is untouched — the API keeps answering it,
 * and a link somebody saved still works.
 */
export function narrowingFeatures(
    designs: readonly { features: readonly Feature[] }[],
): Feature[] {
    return FEATURES.filter((feature) => {
        const withIt = designs.filter((d) => d.features.includes(feature)).length;
        // Useful only when it separates: some designs have it, some do not.
        return withIt > 0 && withIt < designs.length;
    });
}

/** The filters a chip can set. `category` is one too, but it is drawn from its own list. */
export type ChipFilter = "colour" | "layout" | "feature" | "tier";

/** Which filters are currently narrowing the grid — what "Clear all" would undo. */
export function activeFilterCount(query: TemplateQuery): number {
    return (
        (query.category ? 1 : 0) +
        (query.colour ? 1 : 0) +
        (query.layout ? 1 : 0) +
        (query.feature ? 1 : 0) +
        (query.tier ? 1 : 0) +
        (query.q ? 1 : 0)
    );
}

/**
 * The URL for toggling one chip.
 *
 * Pressing an active chip clears it, which is the "individually clearable" half of D7 and
 * the reason this returns a URL rather than a boolean: a chip is a link to the gallery it
 * would produce, so it works before any JavaScript has loaded and the browser's own back
 * button restores the previous set for free.
 *
 * `sort` rides along in `preserve`, and so does the description — changing a filter must
 * never silently drop the sentence someone typed on the describe screen.
 */
export function chipHref(
    preserve: Record<string, string>,
    name: string,
    value: string,
    active: boolean,
): string {
    const params = new URLSearchParams(preserve);

    if (active) params.delete(name);
    else params.set(name, value);

    const query = params.toString();
    return query ? `/templates?${query}` : "/templates";
}
