"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * After Razorpay Pro/Premium checkout, PlansPanel sends the browser to
 * `/?upgraded=pro` (full reload). This banner confirms the upgrade on home.
 */
export function PlanUpgradedBanner() {
    const searchParams = useSearchParams();
    const upgraded = searchParams.get("upgraded");
    const [plan, setPlan] = useState<"pro" | "premium" | null>(null);

    useEffect(() => {
        if (upgraded !== "pro" && upgraded !== "premium") return;

        setPlan(upgraded);

        const url = new URL(window.location.href);
        url.searchParams.delete("upgraded");
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, "", next);
    }, [upgraded]);

    if (!plan) return null;

    const title = plan === "premium" ? "You have been upgraded to Premium" : "You have been upgraded to Pro";
    const detail =
        plan === "premium"
            ? "Every Pro and Premium template, plus Photo-rich and Animated looks, are unlocked."
            : "Every Pro template and the Photo-rich look are unlocked.";

    return (
        <div
            role="status"
            className={cn(
                "fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-4 sm:pt-6",
                "pointer-events-none",
            )}
        >
            <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-2xl border border-gold/50 bg-card/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-gold/20 text-gold">
                    <Check className="size-4" strokeWidth={2.5} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{detail}</p>
                </div>
                <button
                    type="button"
                    className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setPlan(null)}
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}
