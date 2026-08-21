"use client";

import { LookExamples } from "@/components/landing/LookExamples";

const BEATS = [
    "Name · place · what they do",
    "AI writes every page",
    "Three looks from one brief",
    "Edit in place",
    "Go live for Rs 249",
];

export function LandingFlow() {
    const ticker = [...BEATS, ...BEATS];

    return (
        <section id="looks" className="page-slide" aria-label="How a site comes together">
            <div className="mx-auto w-full max-w-7xl px-6">
                <div data-reveal className="mx-auto max-w-2xl text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-brand-ink">
                        Then you pick a look
                    </p>
                    <h2 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                        Same words. Three different sites.
                    </h2>
                    <p className="mt-5 text-base leading-7 text-muted-foreground">
                            Starter, Pro, or Premium — same words, three different sites.
                    </p>
                </div>

                <div className="mt-12">
                    <LookExamples />
                </div>
            </div>

            <div className="mt-12 overflow-hidden border-y border-border/60 py-3">
                <div className="look-marquee text-sm font-medium tracking-wide text-muted-foreground">
                    {ticker.map((beat, i) => (
                        <span key={`${beat}-${i}`} className="flex items-center gap-3">
                            <span className="text-brand-ink">●</span>
                            {beat}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}
