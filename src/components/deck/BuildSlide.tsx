import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { TemplateCard } from "@/components/discovery/TemplateCard";
import { IntentCapture } from "@/components/discovery/IntentCapture";
import { buttonVariants } from "@/components/ui/button";
import type { TemplateSummary } from "@/lib/templates/query";
import { templateUuid } from "@/lib/templates/template-id";
import { templateBadge } from "@/lib/payments/pricing";

export function BuildSlide({
    templates,
    unlockedTemplateIds = [],
}: {
    templates: TemplateSummary[];
    unlockedTemplateIds?: string[];
}) {
    const tiles = templates.slice(0, 12);

    return (
        <section
            id="build"
            className="page-slide page-slide-tall"
            aria-labelledby="build-heading"
        >
            <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 lg:grid-cols-2 lg:items-start">
                <div>
                    <header className="mb-5">
                        <h2
                            id="build-heading"
                            className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
                        >
                            Start from a design
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            Twelve of ours. Open one and make it yours.
                        </p>
                    </header>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {tiles.map((template, index) => {
                            const forkId = templateUuid(template.id);
                            return (
                                <TemplateCard
                                    key={template.id}
                                    template={template}
                                    index={index + 1}
                                    compact
                                    lockable
                                    unlocked={!templateBadge(template.tier) || unlockedTemplateIds.includes(forkId)}
                                    forkId={forkId}
                                />
                            );
                        })}
                    </div>
                    <Link
                        href="/templates"
                        className={buttonVariants({
                            variant: "outline-brand",
                            size: "lg",
                            className: "mt-5 rounded-full font-semibold",
                        })}
                    >
                        Explore more
                        <ArrowRight aria-hidden />
                    </Link>
                </div>

                <aside className="lg:sticky lg:top-24">
                    <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                        Or ask AI
                    </p>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                        Ask AI to build it for you
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Name, place, and what they do. We write every page from those facts.
                    </p>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        On Starter, you can create or regenerate a site{" "}
                        <span className="font-medium text-foreground">3 times</span> (each round
                        gives three looks). Pro gives 5× AI usage; Premium gives 15× — both on
                        User Plans.
                    </p>
                    <Link
                        href="/plans"
                        className={buttonVariants({
                            variant: "outline-brand",
                            size: "sm",
                            className: "mt-3 rounded-full font-semibold",
                        })}
                    >
                        View User Plans
                        <ArrowRight aria-hidden />
                    </Link>
                    <div className="mt-5">
                        <IntentCapture library={false} />
                    </div>
                </aside>
            </div>
        </section>
    );
}
