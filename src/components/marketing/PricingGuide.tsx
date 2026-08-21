"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { TIER_PRICE_INR } from "@/lib/payments/pricing";
import { cn } from "@/lib/utils";

function openCompareBelow() {
    const el = document.getElementById("compare");
    if (!el) {
        window.location.assign("/compare");
        return;
    }

    const html = document.documentElement;
    const hadSnap = html.classList.contains("deck-snap");
    if (hadSnap) html.classList.remove("deck-snap");
    el.scrollIntoView({ behavior: "auto", block: "start" });
    window.history.replaceState(null, "", "/?slide=compare");
    if (hadSnap) {
        requestAnimationFrame(() => html.classList.add("deck-snap"));
    }
}

const LOOKS = [
    {
        label: "Starter",
        look: "Casual",
        price: TIER_PRICE_INR.free,
        blurb: "All Starter designs and the Casual look — free to use and publish.",
    },
    {
        label: "Pro",
        look: "Photo-rich",
        price: TIER_PRICE_INR.premium,
        blurb: "One upgrade unlocks every Pro template and the Photo-rich look.",
    },
    {
        label: "Premium",
        look: "Animated",
        price: TIER_PRICE_INR.signature,
        blurb: "One upgrade unlocks every Premium template, every Pro template, and Animated.",
    },
] as const;

/** One public price story: Starter / Pro / Premium plans. AI rebuilds live under /packages. */
export function PricingGuide({ signedIn = false }: { signedIn?: boolean }) {
    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
            <header className="space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                    Pricing
                </p>
                <h1
                    id="pricing-heading"
                    className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
                >
                    Starter, Pro, or <span className="hero-mix">Premium</span>
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    No monthly subscription. Start free. Upgrade once to unlock every design
                    marked for that plan — not one template at a time.{" "}
                    <Link
                        href="/plans"
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                        See User Plans
                    </Link>
                    .
                </p>
            </header>

            <section className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                    {LOOKS.map((item) => (
                        <article
                            key={item.label}
                            className="rounded-2xl border border-border p-4"
                        >
                            <p className="text-sm font-medium text-muted-foreground">
                                {item.label} · {item.look}
                            </p>
                            <p className="mt-1 text-2xl font-bold">
                                {item.price === 0 ? "Free" : `Rs ${item.price}`}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">{item.blurb}</p>
                        </article>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={openCompareBelow}
                    className={cn(
                        buttonVariants({
                            variant: "outline-brand",
                            className: "rounded-lg font-semibold",
                        }),
                    )}
                >
                    Starter vs Pro vs Premium
                    <ArrowRight aria-hidden />
                </button>
            </section>

            {signedIn ? (
                <p className="text-sm text-muted-foreground">
                    Need more AI rebuilds on a site?{" "}
                    <Link
                        href="/packages"
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                        Manage AI usage
                    </Link>
                    .
                </p>
            ) : null}
        </div>
    );
}
