import type { CSSProperties } from "react";
import { TemplateCard } from "@/components/discovery/TemplateCard";
import type { TemplateSummary } from "@/lib/templates/query";

export function LandingShowcase({ templates }: { templates: TemplateSummary[] }) {
    return (
        <section id="showcase" className="page-slide" aria-labelledby="showcase-heading">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6">
                <h2
                    id="showcase-heading"
                    data-reveal
                    className="max-w-xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl"
                >
                    Built by people who{" "}
                    <span className="text-bloom-sky">don&apos;t</span>{" "}
                    <span className="hero-gold">code</span>
                </h2>

                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {templates.map((template, i) => (
                        <li
                            key={template.id}
                            data-reveal
                            style={{ "--reveal": i } as CSSProperties}
                        >
                            <TemplateCard template={template} index={i + 1} showPrice={false} />
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
