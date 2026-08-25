"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DiscountCodeField, codesMatch, type AppliedCoupon } from "@/components/payments/DiscountCodeField";
import { useRazorpayCheckout } from "@/hooks/useRazorpayCheckout";
import { waitForAdvancedGrant, waitForGenerationPass } from "@/lib/payments/wait-for-pro";
import type { BillingSummary } from "@/lib/contracts";
import { AI_PACKAGES, GENERATION_PASS } from "@/lib/payments/packages";
import { cn } from "@/lib/utils";

export function PackagesPanel({ initial }: { initial: BillingSummary }) {
    const [billing, setBilling] = useState(initial);
    const [message, setMessage] = useState<string | null>(null);
    const [discountCode, setDiscountCode] = useState("");
    const [applied, setApplied] = useState<AppliedCoupon | null>(null);
    const pendingBuyRef = useRef<"advanced" | "pass" | null>(null);
    const passBaselineRef = useRef(0);

    const refresh = useCallback(async () => {
        const { apiGet } = await import("@/lib/api/client");
        const { data } = await apiGet<BillingSummary>("/api/v1/account/billing");
        if (data) setBilling(data);
    }, []);

    const { openAdvancedCheckout, openGenerationPassCheckout, status, error, confirmDialog } =
        useRazorpayCheckout({
            onAlreadyGranted: () => {
                pendingBuyRef.current = null;
                setMessage("Advanced is already on this account.");
                void refresh();
            },
            onSuccess: () => {
                const kind = pendingBuyRef.current;
                pendingBuyRef.current = null;
                setMessage("Payment received. Unlocking…");
                void (async () => {
                    if (kind === "advanced") {
                        const ok = await waitForAdvancedGrant();
                        setMessage(
                            ok
                                ? "Advanced is active — you now get 30 AI generations per site."
                                : "Payment went through. If Advanced is not showing yet, refresh in a moment.",
                        );
                    } else if (kind === "pass") {
                        const ok = await waitForGenerationPass(passBaselineRef.current + 1);
                        setMessage(
                            ok
                                ? "Extra generation pass added — use it on any site that has hit its limit."
                                : "Payment went through. If the pass is not showing yet, refresh in a moment.",
                        );
                    }
                    await refresh();
                })();
            },
            onDismiss: () => {
                pendingBuyRef.current = null;
            },
            onError: (err) => {
                pendingBuyRef.current = null;
                setMessage(err);
            },
        });

    function couponReady(): boolean {
        const typed = discountCode.trim();
        if (!typed) return true;
        if (applied && codesMatch(applied.code, typed)) return true;
        setMessage("Press Apply to use that coupon before checkout. Razorpay should see the new price first.");
        return false;
    }

    async function buyAdvanced() {
        setMessage(null);
        if (!couponReady()) return;
        pendingBuyRef.current = "advanced";
        await openAdvancedCheckout(applied?.code.trim() || undefined);
    }

    async function buyPass() {
        setMessage(null);
        if (!couponReady()) return;
        passBaselineRef.current = billing.generationPasses;
        pendingBuyRef.current = "pass";
        await openGenerationPassCheckout(applied?.code.trim() || undefined);
    }

    const free = AI_PACKAGES.free;
    const advanced = AI_PACKAGES.advanced;
    const hasAdvanced = billing.aiPackage === "advanced";
    const busy = status === "loading" || status === "open" || status === "verifying";
    const advancedDeal = applied?.prices.advanced;
    const passDeal = applied?.prices.generation_pass;

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
            {confirmDialog}
            <header className="space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                    AI usage
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    More AI rebuilds
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    When a site has used its free AI rounds, upgrade here so you can keep asking for
                    new versions. Site looks (Casual, Photo-rich, Animated) come with{" "}
                    <Link
                        href="/plans"
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                        User Plans
                    </Link>
                    .
                </p>
            </header>

            <DiscountCodeField
                kind="advanced"
                kinds={["advanced", "generation_pass"]}
                value={discountCode}
                onChange={setDiscountCode}
                onApplied={setApplied}
                className="max-w-md"
            />

            <div className="grid gap-4 sm:grid-cols-2">
                <article
                    className={cn(
                        "rounded-2xl border border-border p-5",
                        !hasAdvanced && "ring-2 ring-primary/40",
                    )}
                >
                    <p className="text-sm font-medium text-muted-foreground">{free.name}</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight">Rs 0</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{free.blurb}</p>
                    <ul className="mt-4 space-y-2 text-sm text-foreground">
                        {free.features.map((line) => (
                            <li key={line} className="flex gap-2">
                                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                                <span>{line}</span>
                            </li>
                        ))}
                    </ul>
                    {!hasAdvanced ? (
                        <p className="mt-5 text-sm font-semibold text-foreground">Your current package</p>
                    ) : (
                        <p className="mt-5 text-sm text-muted-foreground">Included for every account</p>
                    )}
                </article>

                <article
                    className={cn(
                        "rounded-2xl border border-border p-5",
                        hasAdvanced && "ring-2 ring-primary/40",
                    )}
                >
                    <p className="text-sm font-medium text-muted-foreground">{advanced.name}</p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-2 text-3xl font-bold tracking-tight">
                        {advancedDeal && advancedDeal.priceInr < advancedDeal.listPriceInr ? (
                            <>
                                <span>{advancedDeal.priceInr === 0 ? "Free" : `Rs ${advancedDeal.priceInr}`}</span>
                                <span className="text-base font-normal text-muted-foreground line-through">
                                    Rs {advancedDeal.listPriceInr}
                                </span>
                            </>
                        ) : (
                            <span>Rs {advanced.priceInr}</span>
                        )}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{advanced.blurb}</p>
                    <ul className="mt-4 space-y-2 text-sm text-foreground">
                        {advanced.features.map((line) => (
                            <li key={line} className="flex gap-2">
                                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                                <span>{line}</span>
                            </li>
                        ))}
                    </ul>
                    {hasAdvanced ? (
                        <p className="mt-5 text-sm font-semibold text-foreground">Active on this account</p>
                    ) : (
                        <Button
                            className="mt-5 w-full cursor-pointer rounded-lg font-semibold"
                            disabled={busy}
                            onClick={() => void buyAdvanced()}
                        >
                            {busy
                                ? "Opening checkout…"
                                : advancedDeal && advancedDeal.priceInr === 0
                                  ? "Unlock Advanced · Free"
                                  : advancedDeal && advancedDeal.priceInr < advancedDeal.listPriceInr
                                    ? `Upgrade to Advanced · Rs ${advancedDeal.priceInr}`
                                    : `Upgrade to Advanced · Rs ${advanced.priceInr}`}
                        </Button>
                    )}
                </article>
            </div>

            <section className="rounded-2xl border border-dashed border-border p-5">
                <h2 className="text-lg font-semibold text-foreground">{GENERATION_PASS.name}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {GENERATION_PASS.blurb} Use this after your Free or Advanced allowance on a site
                    is finished.
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                    Passes on this account:{" "}
                    <span className="font-semibold text-foreground">{billing.generationPasses}</span>
                </p>
                <Button
                    variant="outline-brand"
                    className="mt-4 cursor-pointer rounded-lg font-semibold"
                    disabled={busy}
                    onClick={() => void buyPass()}
                >
                    {busy
                        ? "Opening checkout…"
                        : passDeal && passDeal.priceInr === 0
                          ? "Add one pass · Free"
                          : passDeal && passDeal.priceInr < passDeal.listPriceInr
                            ? `Buy one pass · Rs ${passDeal.priceInr}`
                            : `Buy one pass · Rs ${GENERATION_PASS.priceInr}`}
                </Button>
            </section>

            {(message || error) && (
                <p className="text-sm text-muted-foreground" role="status">
                    {error ?? message}
                </p>
            )}

            {!billing.paymentsReady ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                    Payments are not configured on this server yet. Set{" "}
                    <code className="font-mono text-xs">RAZORPAY_KEY_ID</code> and{" "}
                    <code className="font-mono text-xs">RAZORPAY_KEY_SECRET</code> in the server
                    environment (see <code className="font-mono text-xs">.env.example</code>), then
                    restart the app. Checkout will also need{" "}
                    <code className="font-mono text-xs">RAZORPAY_WEBHOOK_SECRET</code> as a
                    backup grant path after payment (browser verify also grants).
                </p>
            ) : null}

            <p className="text-sm text-muted-foreground">
                Looking for site looks?{" "}
                <Link href="/?slide=pricing" className="font-medium text-foreground underline-offset-4 hover:underline">
                    See pricing
                </Link>
                .
            </p>
        </div>
    );
}
