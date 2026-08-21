"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Lock } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { CardIndex } from "@/components/ui/card-index";
import {
    COMPARE_LOOKS,
    DEMO_BRAND,
    lookTierPreviewHtml,
    type CompareLookId,
} from "@/lib/demos/look-tiers";
import { cn } from "@/lib/utils";

const TIER_BADGE: Record<CompareLookId, string> = {
    starter: "border border-border bg-background text-foreground",
    pro: "bg-primary text-primary-foreground",
    premium: "brand-gradient text-primary-foreground",
};

const TIER_BADGE_LABEL: Record<CompareLookId, string> = {
    starter: "Free",
    pro: "Pro",
    premium: "Premium",
};

export function LookCompareDemo() {
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
                    Pick a <span className="hero-mix">look</span> — side by side
                </h1>
                <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                    Same restaurant, three looks. Casual comes with Starter. Photo-rich unlocks
                    with Pro (Rs {COMPARE_LOOKS[1].priceInr}) — every Pro design too. Animated
                    unlocks with Premium (Rs {COMPARE_LOOKS[2].priceInr}). Fixed preview, not
                    live AI.
                </p>
                <p className="text-sm text-muted-foreground">
                    <Link href="/pricing" className="underline-offset-4 hover:underline">
                        See all pricing
                    </Link>
                </p>
            </header>

            <ul className="look-chunk-grid grid grid-cols-1 gap-5 lg:grid-cols-3">
                {COMPARE_LOOKS.map((item, i) => {
                    const on = item.id === look;
                    const paid = item.priceInr > 0;
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
                                <div className="relative h-48 overflow-hidden bg-muted">
                                    <iframe
                                        title={`${item.label} preview`}
                                        srcDoc={previews[item.id]}
                                        sandbox="allow-scripts"
                                        tabIndex={-1}
                                        className="pointer-events-none absolute left-0 top-0 h-[220%] w-[180%] origin-top-left scale-[0.56] border-0 bg-transparent"
                                    />
                                    <span
                                        className={cn(
                                            "absolute right-2 top-2 z-[2] inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold shadow-sm",
                                            TIER_BADGE[item.id],
                                        )}
                                    >
                                        {paid ? (
                                            <Lock className="size-3" strokeWidth={2} aria-hidden />
                                        ) : null}
                                        {TIER_BADGE_LABEL[item.id]}
                                    </span>
                                </div>
                                <div className="relative z-[1] flex flex-1 flex-col gap-2 p-4">
                                    <h2 className="text-base font-semibold text-foreground">
                                        {item.label}
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
                                        {item.priceInr === 0 ? "Free" : `Rs ${item.priceInr}`}
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
                            {DEMO_BRAND.domain} · {active.label}
                        </span>
                    </div>
                    <iframe
                        key={look}
                        title={`${DEMO_BRAND.name} ${active.label} preview`}
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
                                    {item.priceInr === 0 ? "Rs 0" : `Rs ${item.priceInr}`}
                                </td>
                            ))}
                        </tr>
                        <tr className="border-b border-border/70">
                            <td className="px-4 py-3 text-muted-foreground">Chrome</td>
                            <td className="px-4 py-3">Sidebar</td>
                            <td className="px-4 py-3">Blended top bar</td>
                            <td className="px-4 py-3">Liquid scroll</td>
                        </tr>
                        <tr className="border-b border-border/70">
                            <td className="px-4 py-3 text-muted-foreground">Page count</td>
                            {COMPARE_LOOKS.map((item) => (
                                <td key={item.id} className="px-4 py-3">
                                    {item.pages.length}
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="px-4 py-3 text-muted-foreground">Booking CTA</td>
                            <td className="px-4 py-3">Contact only</td>
                            <td className="px-4 py-3">Table booking</td>
                            <td className="px-4 py-3">Reservations section</td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    );
}
