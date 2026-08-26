"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { CardIndex } from "@/components/ui/card-index";
import type { AccountPlan } from "@/lib/contracts";
import {
    COMPARE_LOOKS,
    DEMO_BRAND,
    lookTierPreviewHtml,
    type CompareLookId,
} from "@/lib/demos/look-tiers";
import { planCovers } from "@/lib/payments/plans";
import { cn } from "@/lib/utils";

/** Same black pill as Free — Pro / Premium never get a red lock badge on Compare. */
const COMPARE_BADGE = "border border-border bg-background text-foreground";

const REQUIRED_PLAN: Record<CompareLookId, "pro" | "premium" | null> = {
    starter: null,
    pro: "pro",
    premium: "premium",
};

function lookUnlocked(plan: AccountPlan, id: CompareLookId): boolean {
    const need = REQUIRED_PLAN[id];
    if (!need) return true;
    return planCovers(plan, need);
}

/** Plain tier names on the card: Free, Pro, or Premium — never "… unlocked". */
function tileLabel(id: CompareLookId): string {
    if (id === "starter") return "Free";
    if (id === "pro") return "Pro";
    return "Premium";
}

function footerPrice(plan: AccountPlan, id: CompareLookId, priceInr: number): string {
    return lookUnlocked(plan, id) ? "Free" : priceInr === 0 ? "Free" : `Rs ${priceInr}`;
}

export function LookCompareDemo({ plan = "starter" }: { plan?: AccountPlan }) {
    const [look, setLook] = useState<CompareLookId>("starter");
    const active = COMPARE_LOOKS.find((item) => item.id === look) ?? COMPARE_LOOKS[0];
    const previews = useMemo(
        () =>
            Object.fromEntries(
                COMPARE_LOOKS.map((item) => [item.id, lookTierPreviewHtml(item.id)]),
            ) as Record<CompareLookId, string>,
        [],
    );
    const srcDoc = previews[look];

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
            <header className="flex flex-col items-center gap-3 text-center">
                <p className="glass-pill w-fit font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-foreground">
                    <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
                    Three looks, one brief
                </p>
                <h1
                    id="compare-heading"
                    className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
                >
                    Pick a <span className="hero-mix">look</span> — live preview
                </h1>
                <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                    {plan === "premium"
                        ? "Same restaurant, three live sites. Premium is active — every look and Pro design is unlocked."
                        : plan === "pro"
                          ? "Same restaurant, three live sites. Pro is active — Starter is Free, Photo-rich is unlocked, plus every Pro template. Continuous-scroll Premium unlocks with Premium."
                          : "Same restaurant rendered three ways with our real generators. Starter is Free. Pro (Rs 499) unlocks the photographic look. Premium (Rs 999) unlocks continuous scroll. Click a card, then scroll the live preview."}
                </p>
                <p className="text-sm text-muted-foreground">
                    <Link href="/plans" className="underline-offset-4 hover:underline">
                        See all pricing
                    </Link>
                </p>
            </header>

            <ul className="look-chunk-grid grid grid-cols-1 gap-5 lg:grid-cols-3">
                {COMPARE_LOOKS.map((item, i) => {
                    const on = item.id === look;
                    const unlocked = lookUnlocked(plan, item.id);
                    const paid = !unlocked;
                    const label = tileLabel(item.id);
                    return (
                        <li
                            key={item.id}
                            className="look-chunk-card"
                            style={{ animationDelay: `${i * 90}ms` }}
                        >
                            <button
                                type="button"
                                onClick={() => setLook(item.id)}
                                className={cn(
                                    "glass-panel card-hover relative flex h-full w-full flex-col overflow-hidden rounded-2xl text-left transition-[box-shadow,ring-color]",
                                    on && "ring-2 ring-primary/70",
                                    item.id === "premium" &&
                                        "shadow-[0_0_28px_color-mix(in_srgb,var(--gold)_28%,transparent)]",
                                )}
                            >
                                <CardIndex n={i + 1} />
                                {/* Thumbnail: real page at 50% scale. Pointer-events off so the
                                    card button still receives the click to switch the live frame. */}
                                <div className="relative h-56 overflow-hidden bg-muted">
                                    <iframe
                                        title={`${item.label} preview`}
                                        srcDoc={previews[item.id]}
                                        sandbox="allow-scripts"
                                        tabIndex={-1}
                                        className="pointer-events-none absolute left-0 top-0 h-[200%] w-[200%] origin-top-left scale-50 border-0 bg-transparent"
                                    />
                                    <span
                                        className={cn(
                                            "absolute right-2 top-2 z-[2] inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold shadow-sm",
                                            COMPARE_BADGE,
                                        )}
                                    >
                                        {label}
                                    </span>
                                </div>
                                <div className="relative z-[1] flex flex-1 flex-col gap-2 p-4">
                                    <h2 className="text-base font-semibold text-foreground">
                                        {item.label}
                                        <span className="ml-2 text-xs font-medium text-muted-foreground">
                                            {item.lookName}
                                        </span>
                                    </h2>
                                    <p className="text-sm leading-5 text-muted-foreground">
                                        {item.blurb}
                                    </p>
                                    <p
                                        className={cn(
                                            "mt-auto pt-2 text-sm font-semibold",
                                            paid ? "text-gold" : "text-foreground",
                                        )}
                                    >
                                        {footerPrice(plan, item.id, item.priceInr)}
                                    </p>
                                </div>
                            </button>
                        </li>
                    );
                })}
            </ul>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                    <div className="flex items-center gap-1.5 border-b border-border/40 bg-background/70 px-3 py-2">
                        <span className="size-1.5 rounded-full bg-primary/80" />
                        <span className="size-1.5 rounded-full bg-signal" />
                        <span className="size-1.5 rounded-full bg-bloom-sky" />
                        <span className="ml-2 truncate font-mono text-[10px] text-muted-foreground">
                            {DEMO_BRAND.domain} · {active.label} · live preview
                        </span>
                        <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">
                            Scroll inside to explore
                        </span>
                    </div>
                    <iframe
                        key={look}
                        title={`${DEMO_BRAND.name} ${active.label} live preview`}
                        srcDoc={srcDoc}
                        className="h-[min(70vh,42rem)] w-full bg-white"
                        sandbox="allow-scripts allow-same-origin"
                    />
                </div>

                <aside className="space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">{active.label}</h2>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{active.blurb}</p>
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Pages
                        </p>
                        <ul className="mt-2 space-y-1.5 text-sm text-foreground">
                            {active.pages.map((page) => (
                                <li key={page} className="flex gap-2">
                                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                                    {page}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Features
                        </p>
                        <ul className="mt-2 space-y-1.5 text-sm text-foreground">
                            {active.features.map((feature) => (
                                <li key={feature} className="flex gap-2">
                                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                                    {feature}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <Link
                        href="/#build"
                        className={buttonVariants({
                            variant: "brand",
                            className: "w-full rounded-lg font-semibold",
                        })}
                    >
                        Build your own
                    </Link>
                </aside>
            </div>

            <section className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="border-b border-border bg-secondary/40 text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 font-medium">What you get</th>
                            {COMPARE_LOOKS.map((item) => (
                                <th key={item.id} className="px-4 py-3 font-medium text-foreground">
                                    {item.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b border-border/70">
                            <td className="px-4 py-3 text-muted-foreground">Price</td>
                            {COMPARE_LOOKS.map((item) => (
                                <td key={item.id} className="px-4 py-3">
                                    {footerPrice(plan, item.id, item.priceInr)}
                                </td>
                            ))}
                        </tr>
                        <tr className="border-b border-border/70">
                            <td className="px-4 py-3 text-muted-foreground">Layout</td>
                            <td className="px-4 py-3">Centre-filled pages</td>
                            <td className="px-4 py-3">Photo backdrop + page fades</td>
                            <td className="px-4 py-3">Continuous scroll deck</td>
                        </tr>
                        <tr className="border-b border-border/70">
                            <td className="px-4 py-3 text-muted-foreground">Chrome</td>
                            <td className="px-4 py-3">Simple header</td>
                            <td className="px-4 py-3">Blended top bar</td>
                            <td className="px-4 py-3">Liquid sticky bar</td>
                        </tr>
                        <tr className="border-b border-border/70">
                            <td className="px-4 py-3 text-muted-foreground">Photography</td>
                            <td className="px-4 py-3">One hero photo</td>
                            <td className="px-4 py-3">Full-site topic photo</td>
                            <td className="px-4 py-3">Hero + kinetic stage</td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3 text-muted-foreground">Motion</td>
                            <td className="px-4 py-3">None</td>
                            <td className="px-4 py-3">Parallax + page fades + card zoom</td>
                            <td className="px-4 py-3">Scroll reveals + motif</td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    );
}
