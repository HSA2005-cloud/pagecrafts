import Link from "next/link";
import { Sparkles } from "lucide-react";

import type { Category } from "@/lib/contracts";
import { CATEGORY_LABELS } from "@/lib/discovery/categories";
import type { SortKey, TemplateSummary } from "@/lib/templates/query";
import type { PlanId } from "@/lib/plans/catalog";
import { TemplateCard } from "@/components/discovery/TemplateCard";
import { CardIndex } from "@/components/ui/card-index";
import { SortSelect } from "@/components/discovery/SortSelect";
import { GalleryEmpty } from "@/components/discovery/GalleryStates";

// Pinned below the grid in every state, including zero results (D-6, AC-F3-4): there is
// always a way forward from this screen, even when no design matches.
function DesignSomethingNewCard({ index }: { index: number }) {
    return (
        <Link
            href="/new"
            className="card-hover group relative flex flex-col overflow-hidden rounded-xl border border-dashed border-primary/40 bg-card transition-colors hover:border-primary hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
            <CardIndex n={index} />
            <div className="relative z-[1] flex aspect-16/10 flex-col items-center justify-center gap-1.5 px-6 text-center">
                <span
                    aria-hidden
                    className="brand-halo flex size-10 items-center justify-center rounded-full border border-primary/40 bg-accent"
                >
                    <Sparkles className="size-5 text-primary" strokeWidth={1.75} />
                </span>
                <span className="mt-1 text-sm font-semibold text-foreground">
                    Design something new
                </span>
                <span className="text-xs text-muted-foreground">
                    Describe it and we build it
                </span>
            </div>
            <div className="relative z-[1] flex items-center justify-between gap-3 border-t border-border px-3 py-2.5">
                <span className="text-sm font-medium text-foreground">
                    Start from scratch
                </span>
            </div>
        </Link>
    );
}

export function GalleryGrid({
    templates,
    total,
    activeCategory,
    sort,
    preserve,
    personalised,
    resetHref,
    ranked = false,
    plan = "starter",
}: {
    templates: TemplateSummary[];
    /** How many designs the library holds, for the "showing N of M" line. */
    total: number;
    activeCategory?: Category;
    sort: SortKey;
    preserve: Record<string, string>;
    personalised: boolean;
    resetHref: string;
    /** True when a description was classified, so the order carries a real score (D6). */
    ranked?: boolean;
    /** The viewer's plan, threaded to every tile so locks reflect it (R-plans). */
    plan?: PlanId;
}) {
    const filtered = templates.length !== total;

    // The relevance cue, and the only honest one available: which designs actually matched
    // something the person described, and which are simply the rest of the library sitting
    // below them. A score of 30 is not "94% relevant" and must never be dressed up as one —
    // it is tag overlap, and the useful thing it can say is "this matched, that did not".
    // With no ranking, or with everything matching, there is nothing to divide and the grid
    // stays one grid.
    const matched = ranked ? templates.filter((t) => t.score > 0) : templates;
    const rest = ranked ? templates.filter((t) => t.score === 0) : [];
    const split = ranked && matched.length > 0 && rest.length > 0;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="flex flex-wrap items-center gap-2.5 text-xl font-bold tracking-tight text-foreground">
                    {templates.length} design{templates.length === 1 ? "" : "s"}
                    {personalised ? " for you" : " to start from"}
                    {filtered && (
                        // The leading space is inside the span deliberately. `gap-2.5` on
                        // the heading separates these visually but not in the text stream,
                        // so a screen reader — and anyone copying the heading — got
                        // "0 designs to start fromof 115" (R2 D19).
                        <span className="text-sm font-normal text-muted-foreground">
                            {" of "}
                            {total}
                        </span>
                    )}
                    {activeCategory && (
                        <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-xs font-medium text-brand-ink">
                            · {CATEGORY_LABELS[activeCategory]}
                        </span>
                    )}
                </h2>
                <SortSelect value={sort} preserve={preserve} />
            </div>

            {templates.length === 0 && <GalleryEmpty resetHref={resetHref} />}

            {templates.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {(split ? matched : templates).map((template, index) => (
                        <TemplateCard
                            key={template.id}
                            template={template}
                            index={index + 1}
                            plan={plan}
                        />
                    ))}
                </div>
            )}

            {split && (
                <section className="mt-4 flex flex-col gap-4">
                    <h3 className="text-sm font-medium text-muted-foreground">
                        Everything else in the library
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {rest.map((template, index) => (
                            <TemplateCard
                                key={template.id}
                                template={template}
                                index={matched.length + index + 1}
                                plan={plan}
                            />
                        ))}
                    </div>
                </section>
            )}

            <section className="mt-6 flex flex-col gap-4">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                    Want something else?
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <DesignSomethingNewCard index={templates.length + 1} />
                </div>
            </section>

        </div>
    );
}
