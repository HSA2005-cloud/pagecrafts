"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import type { ApiResult } from "@/lib/contracts";
import { PLANS, planRank, type PlanId } from "@/lib/plans/catalog";
import type { PlanCheckoutResponse } from "@/lib/payments/plans";
import { cn } from "@/lib/utils";
import { loadRazorpay, openCheckout, type RazorpayHandlerResponse } from "./razorpay";

// The User Plans cards (R-plans). Three plans side by side; the current one is marked from
// the server-derived `currentPlan`, never from anything this component decides on its own.
//
// A paid button runs the whole flow: create an order, open Razorpay, verify the completion
// server-side, then refresh so the page re-reads the plan and the locks fall away. Nothing
// here trusts the browser's word that a payment worked — verify does that on the server.

type CardAction =
    | { kind: "current" }
    | { kind: "included" }
    | { kind: "buy"; label: string };

function actionFor(plan: PlanId, current: PlanId): CardAction {
    if (plan === current) return { kind: "current" };
    if (planRank(current) > planRank(plan)) return { kind: "included" };
    if (plan === "premium") {
        return { kind: "buy", label: current === "pro" ? "Upgrade to Premium" : "Choose Premium" };
    }
    return { kind: "buy", label: "Choose Pro" };
}

const CANCELLED = "Payment was cancelled.";
const FAILED = "Payment could not be completed. Please try again.";
const UNAVAILABLE = "The payment window could not open. Please try again in a moment.";
const UNVERIFIED =
    "Your payment was received, but we couldn't verify it yet. Please check your plan status before trying again.";

export function PlanCards({ currentPlan }: { currentPlan: PlanId }) {
    const router = useRouter();
    const [busy, setBusy] = useState<PlanId | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    async function verify(plan: PlanId, response: RazorpayHandlerResponse) {
        try {
            const res = await fetch("/api/v1/plans/verify", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    razorpayOrderId: response.razorpay_order_id,
                    razorpayPaymentId: response.razorpay_payment_id,
                    razorpaySignature: response.razorpay_signature,
                }),
            });
            const body = (await res.json().catch(() => null)) as ApiResult<{ plan: PlanId }> | null;

            if (!body || !body.ok) {
                setError(UNVERIFIED);
                return;
            }

            setSuccess(`You're on the ${labelOf(body.data.plan)} plan.`);
            // Re-read the plan on the server so this page and the template locks update
            // without a manual reload or a fresh sign-in.
            router.refresh();
        } catch {
            setError(UNVERIFIED);
        } finally {
            setBusy(null);
        }
    }

    async function choose(plan: PlanId) {
        setError(null);
        setSuccess(null);
        setBusy(plan);

        let checkout: PlanCheckoutResponse;
        try {
            const res = await fetch("/api/v1/plans/checkout", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ plan }),
            });
            const body = (await res.json().catch(() => null)) as ApiResult<PlanCheckoutResponse> | null;

            if (!body || !body.ok) {
                setError(body && !body.ok ? body.error.message : FAILED);
                setBusy(null);
                return;
            }
            checkout = body.data;
        } catch {
            setError(FAILED);
            setBusy(null);
            return;
        }

        // Already on this plan (or higher) — nothing was charged; just refresh the view.
        if (checkout.granted) {
            router.refresh();
            setBusy(null);
            return;
        }

        const ready = await loadRazorpay();
        if (!ready) {
            setError(UNAVAILABLE);
            setBusy(null);
            return;
        }

        const opened = openCheckout({
            key: checkout.keyId!,
            order_id: checkout.orderId!,
            amount: checkout.amountInPaise!,
            currency: checkout.currency ?? "INR",
            name: "PageCraft",
            description: `${labelOf(plan)} plan`,
            theme: { color: "#e0a13f" },
            handler: (response) => void verify(plan, response),
            modal: {
                ondismiss: () => {
                    setError(CANCELLED);
                    setBusy(null);
                },
            },
        });

        if (!opened) {
            setError(UNAVAILABLE);
            setBusy(null);
        }
    }

    return (
        <div className="flex flex-col gap-6">
            {error ? (
                <p
                    role="alert"
                    className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                >
                    {error}
                </p>
            ) : null}
            {success ? (
                <p
                    role="status"
                    className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
                >
                    {success}
                </p>
            ) : null}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {PLANS.map((plan) => {
                    const action = actionFor(plan.id, currentPlan);
                    const isBusy = busy === plan.id;

                    return (
                        <section
                            key={plan.id}
                            aria-label={`${plan.name} plan`}
                            className={cn(
                                "relative flex flex-col rounded-2xl border bg-card/60 p-6 shadow-sm backdrop-blur-sm",
                                plan.popular
                                    ? "border-amber-400/50 ring-1 ring-amber-400/30"
                                    : "border-border",
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-muted-foreground">{plan.name}</p>
                                {plan.popular ? (
                                    <span className="rounded-full border border-amber-400/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                                        Popular
                                    </span>
                                ) : null}
                            </div>

                            <div className="mt-3 flex items-baseline gap-2">
                                <span className="text-4xl font-bold tracking-tight text-foreground">
                                    {plan.priceLabel}
                                </span>
                                {plan.priceInr > 0 ? (
                                    <span className="text-sm text-muted-foreground">{plan.tagline}</span>
                                ) : null}
                            </div>

                            <p className="mt-4 text-sm leading-6 text-muted-foreground">
                                {plan.description}
                            </p>

                            <ul className="mt-6 flex flex-1 flex-col gap-3">
                                {plan.features.map((feature) => (
                                    <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
                                        <Check
                                            className="mt-0.5 size-4 shrink-0 text-emerald-400"
                                            strokeWidth={2.5}
                                            aria-hidden
                                        />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-8">
                                <PlanButton
                                    plan={plan.id}
                                    action={action}
                                    busy={isBusy}
                                    disabledAll={busy !== null && !isBusy}
                                    onBuy={() => void choose(plan.id)}
                                />
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

function PlanButton({
    plan,
    action,
    busy,
    disabledAll,
    onBuy,
}: {
    plan: PlanId;
    action: CardAction;
    busy: boolean;
    disabledAll: boolean;
    onBuy: () => void;
}) {
    const base =
        "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70";

    if (action.kind === "current") {
        return (
            <button type="button" disabled className={cn(base, "border border-border text-foreground")}>
                Current plan
            </button>
        );
    }

    if (action.kind === "included") {
        return (
            <button
                type="button"
                disabled
                className={cn(base, "border border-border/60 text-muted-foreground")}
            >
                Included
            </button>
        );
    }

    const tone =
        plan === "premium"
            ? "bg-red-600 text-white hover:bg-red-500"
            : "bg-amber-400 text-neutral-900 hover:bg-amber-300";

    return (
        <button
            type="button"
            onClick={onBuy}
            disabled={busy || disabledAll}
            className={cn(base, tone)}
        >
            {busy ? (
                <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Starting…
                </>
            ) : (
                action.label
            )}
        </button>
    );
}

function labelOf(plan: PlanId): string {
    return PLANS.find((p) => p.id === plan)?.name ?? "Starter";
}
