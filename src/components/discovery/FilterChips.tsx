import Link from "next/link";
import { X } from "lucide-react";

import type { Category } from "@/lib/contracts";
import { CATEGORY_CARDS, CATEGORY_LABELS } from "@/lib/discovery/categories";
import {
    activeFilterCount,
    chipHref,
    COLOUR_LABELS,
    COLOURS,
    FEATURE_LABELS,
    LAYOUT_LABELS,
    LAYOUTS,
    TIER_LABELS,
    TIERS,
} from "@/lib/discovery/filters";
import { narrowingLibraryFeatures, type TemplateQuery } from "@/lib/templates/query";
import { cn } from "@/lib/utils";

// Screen 04's filter chips (R2 D7). Combinable across groups, individually clearable, and
// mirrored in the URL so back, forward and reload restore the exact gallery.
//
// These are links, not buttons with an onClick. Three things fall out of that and all three
// are the behaviour D7 asks for:
//
//   - the browser's own back button walks the filter history, because each chip is a real
//     navigation rather than a state update;
//   - the gallery is shareable — the URL is the whole state, so a link to it lands someone
//     on the same grid;
//   - it works with no JavaScript, which is also the situation in which the error state is
//     most likely to be the thing on screen.
//
// Sort deliberately does not work this way: SortSelect uses router.replace, so reordering
// does not pile up history entries. Choosing a filter is a decision worth going back from;
// changing the sort is not.

function Chip({
    href,
    label,
    active,
}: {
    href: string;
    label: string;
    active: boolean;
}) {
    return (
        <Link
            href={href}
            // `aria-current`, not `aria-pressed`.
            //
            // This was aria-pressed, on the reasoning that a chip is a toggle and a screen
            // reader should say so. The reasoning was right and the attribute was not:
            // aria-pressed is only defined for a button, and this is a link. An unsupported
            // ARIA attribute is not a weaker announcement, it is no announcement — so the
            // active filter was conveyed by colour and nothing else, to anybody not looking
            // at it. axe reported it as critical across all forty chips (R2 D20).
            //
            // aria-current is valid on a link and announces "current". What it does not
            // carry is that pressing again clears the filter, so that goes into the
            // accessible name below, where it is words rather than an attribute nobody
            // implements.
            aria-current={active ? "true" : undefined}
            className={cn(
                // min-h-9 on a phone, tighter from sm upwards. The chips were 30px tall at
                // every width, which is comfortable with a mouse and not with a thumb —
                // Meera is on a phone, and forty-five of these sat under the finger size
                // people actually have (R2 D15 mobile pass). The text stays the same size;
                // only the target grows, so nothing about the layout changes on desktop.
                "inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-0 sm:px-3",
                active
                    ? "border-gold bg-gold text-gold-foreground hover:bg-[color-mix(in_srgb,var(--gold)_88%,#fff)]"
                    : "border-border bg-card text-muted-foreground hover:border-gold/40 hover:text-foreground",
            )}
        >
            {label}
            {/* The × is what makes "individually clearable" visible rather than something
                you have to discover by pressing an active chip and seeing what happens. It is
                aria-hidden, so the sentence beside it is the same information for somebody
                who cannot see it — "Fitness, selected — activate to clear this filter". */}
            {active && (
                <>
                    <X aria-hidden className="size-3" strokeWidth={2.5} />
                    <span className="sr-only">, selected — activate to clear this filter</span>
                </>
            )}
        </Link>
    );
}

function ChipRow({
    label,
    children,
    scroll = false,
}: {
    label: string;
    children: React.ReactNode;
    scroll?: boolean;
}) {
    return (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:w-16">
                {label}
            </span>
            <div
                className={cn(
                    "flex gap-2",
                    // The category row is the only one that cannot fit: the library ships
                    // designs in thirty-odd buckets. It scrolls inside itself rather than
                    // wrapping into six lines that push the grid off the screen — and never
                    // makes the page scroll sideways.
                    scroll ? "overflow-x-auto pb-1" : "flex-wrap",
                )}
            >
                {children}
            </div>
        </div>
    );
}

export function FilterChips({
    query,
    preserve,
    resetHref,
}: {
    query: TemplateQuery;
    /** Every parameter except the one being toggled — sort, description and intent ride along. */
    preserve: Record<string, string>;
    resetHref: string;
}) {
    const active = activeFilterCount(query);
    // Derived from the library itself rather than passed in: the answer is a property of
    // the designs that exist, and the page should not have to know to ask.
    const features = narrowingLibraryFeatures();

    return (
        <section aria-label="Filter designs" className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-4">
            <ChipRow label="Category" scroll>
                {CATEGORY_CARDS.map((category: Category) => (
                    <Chip
                        key={category}
                        href={chipHref(preserve, "category", category, query.category === category)}
                        label={CATEGORY_LABELS[category]}
                        active={query.category === category}
                    />
                ))}
            </ChipRow>

            <ChipRow label="Price">
                {TIERS.map((tier) => (
                    <Chip
                        key={tier}
                        href={chipHref(preserve, "tier", tier, query.tier === tier)}
                        label={TIER_LABELS[tier]}
                        active={query.tier === tier}
                    />
                ))}
            </ChipRow>

            <ChipRow label="Colour">
                {COLOURS.map((colour) => (
                    <Chip
                        key={colour}
                        href={chipHref(preserve, "colour", colour, query.colour === colour)}
                        label={COLOUR_LABELS[colour]}
                        active={query.colour === colour}
                    />
                ))}
            </ChipRow>

            <ChipRow label="Layout">
                {LAYOUTS.map((layout) => (
                    <Chip
                        key={layout}
                        href={chipHref(preserve, "layout", layout, query.layout === layout)}
                        label={LAYOUT_LABELS[layout]}
                        active={query.layout === layout}
                    />
                ))}
            </ChipRow>

            {/* Only the features that actually divide the library — see narrowingFeatures.
                Today that is none of them, so the row does not render at all rather than
                offering three chips that each return the whole gallery. */}
            {features.length > 0 && (
                <ChipRow label="Has">
                    {features.map((feature) => (
                        <Chip
                            key={feature}
                            href={chipHref(preserve, "feature", feature, query.feature === feature)}
                            label={FEATURE_LABELS[feature]}
                            active={query.feature === feature}
                        />
                    ))}
                </ChipRow>
            )}

            {active > 0 && (
                <div className="flex items-center gap-3 border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                        {active} filter{active === 1 ? "" : "s"} on
                    </span>
                    <Link
                        href={resetHref}
                        className="text-xs font-medium text-brand-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                        Clear all
                    </Link>
                </div>
            )}
        </section>
    );
}
