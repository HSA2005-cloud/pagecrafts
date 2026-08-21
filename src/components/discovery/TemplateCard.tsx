import { CATEGORY_LABELS } from "@/lib/discovery/categories";
import type { TemplateSummary } from "@/lib/templates/query";
import { TemplatePreview } from "@/components/discovery/TemplatePreview";
import { TemplateDetailModal } from "@/components/discovery/TemplateDetailModal";
import { PriceBadge } from "@/components/discovery/PriceBadge";
import { TemplateAccessBadge } from "@/components/discovery/TemplateAccessBadge";
import { CardIndex } from "@/components/ui/card-index";
import { canAccessTier, type PlanId } from "@/lib/plans/catalog";

// A tile: the design, its name, and whether this plan can use it.
//
// The whole tile is one button, so opening a design is a single target for a mouse and a
// single stop for a keyboard (the core flow has to be keyboard-completable — D20).
export function TemplateCard({
    template,
    index,
    compact = false,
    plan = "starter",
}: {
    template: TemplateSummary;
    index: number;
    compact?: boolean;
    /** The viewer's plan, so a design they cannot fork reads as locked (R-plans). */
    plan?: PlanId;
}) {
    const locked = !canAccessTier(plan, template.tier);

    return (
        <article className="card-hover group relative overflow-hidden rounded-xl border border-border bg-card focus-within:border-primary/40">
            <TemplateDetailModal
                templateId={template.id}
                templateName={template.name}
                plan={plan}
            >
                <button
                    type="button"
                    className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <span className="relative block overflow-hidden">
                        <CardIndex n={index} compact={compact} />
                        {/* The rendered thumbnail where the library has one, the parsed
                            miniature where it does not. Never a live iframe either way
                            (D-3, AC-F3-2).

                            The thumbnail is a screenshot of the design's own two files, so
                            it shows what the design actually is — and it replaces roughly
                            9 KB of miniature markup per tile with a 14 KB image the CDN
                            caches immutably. A design with no thumbnail keeps its miniature
                            rather than showing a gap, which is what makes adding a design
                            without rendering one safe (R2 D18). */}
                        {template.thumbnailUrl ? (
                            // A plain <img>, not next/image. The optimiser exists to resize
                            // and re-encode images of unknown provenance; these are ours,
                            // already 640x400 WebP at 14 KB, and putting them through it
                            // would cost a round trip through /_next/image to produce a file
                            // no smaller. The width/height and aspect class hold the space,
                            // so there is no layout shift to buy back either.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={template.thumbnailUrl}
                                alt=""
                                width={640}
                                height={400}
                                loading={index <= 4 ? "eager" : "lazy"}
                                fetchPriority={index <= 4 ? "high" : "auto"}
                                decoding="async"
                                className="block aspect-[16/10] w-full bg-muted object-cover object-top"
                            />
                        ) : (
                            <TemplatePreview preview={template.preview} priority={index <= 4} />
                        )}

                        {/* Access, on the design, before any choice (UI Spec §7.5, R-plans).
                            A design this plan can use keeps its price/free badge; one it
                            cannot shows the plan it needs, with a lock. */}
                        {locked ? (
                            <TemplateAccessBadge
                                tier={template.tier}
                                className="absolute right-2 top-2 z-[1] shadow-sm"
                            />
                        ) : (
                            <PriceBadge
                                tier={template.tier}
                                priceInr={template.priceInr}
                                className="absolute right-2 top-2 z-[1] shadow-sm"
                            />
                        )}
                    </span>

                    <span
                        className={
                            compact
                                ? "relative z-[1] flex items-center justify-between gap-2 border-t border-border px-2 py-1.5"
                                : "relative z-[1] flex items-center justify-between gap-3 border-t border-border px-3 py-2.5"
                        }
                    >
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                            {template.name}
                        </span>
                        {compact ? null : (
                            <span className="shrink-0 text-xs text-muted-foreground">
                                {CATEGORY_LABELS[template.category]}
                            </span>
                        )}
                    </span>

                    {/* Kept for screen readers and search: the tile itself stays visual. */}
                    <span className="sr-only">{template.description}</span>
                </button>
            </TemplateDetailModal>
        </article>
    );
}
