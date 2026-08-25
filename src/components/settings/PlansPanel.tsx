"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DiscountCodeField } from "@/components/payments/DiscountCodeField";
import { useRazorpayCheckout } from "@/hooks/useRazorpayCheckout";
import type { AccountPlan, BillingSummary } from "@/lib/contracts";
import { PLAN_COPY, PLAN_PRICE_INR } from "@/lib/payments/plans";
import { FREE_GENERATIONS_PER_PROJECT } from "@/lib/limits/config";
import { cn } from "@/lib/utils";

const ORDER: AccountPlan[] = ["starter", "pro", "premium"];

const CANCELLED_MESSAGE = "Payment cancelled. Your current plan has not changed.";

function PlanCta({
    id,
    active,
    covered,
    busy,
    pending,
    paymentsReady,
    onUpgrade,
}: {
    id: AccountPlan;
    active: boolean;
    covered: boolean;
    busy: boolean;
    pending: boolean;
    paymentsReady: boolean;
    onUpgrade: (plan: "pro" | "premium") => void;
}) {
    if (active) {
        return (
            <Button
                type="button"
                variant="outline"
                disabled
                className="min-h-11 w-full cursor-default rounded-xl border-border/80 bg-transparent font-semibold text-muted-foreground"
            >
                Current plan
            </Button>
        );
    }

    if (covered) {
        return (
            <p className="flex min-h-11 items-center justify-center text-sm font-medium text-muted-foreground">
                Included
            </p>
        );
    }

    if (id === "pro") {
        return (
            <Button
                type="button"
                variant="brand"
                className="min-h-11 w-full cursor-pointer rounded-xl font-semibold"
                disabled={busy || !paymentsReady}
                onClick={() => onUpgrade("pro")}
            >
                {busy && pending ? "Opening Razorpay…" : "Choose Pro"}
            </Button>
        );
    }

    if (id === "premium") {
        return (
            <Button
                type="button"
                variant="destructive"
                className="min-h-11 w-full cursor-pointer rounded-xl font-semibold"
                disabled={busy || !paymentsReady}
                onClick={() => onUpgrade("premium")}
            >
                {busy && pending ? "Opening Razorpay…" : "Choose Premium"}
            </Button>
        );
    }

    return null;
}

function homeAfterUpgrade(plan: "pro" | "premium"): string {
    return `/?upgraded=${plan}&slide=compare`;
}

export function PlansPanel({
    initial,
    signedIn,
}: {
    initial: BillingSummary;
    signedIn: boolean;
}) {
    const router = useRouter();
    const [billing] = useState(initial);
    const [message, setMessage] = useState<string | null>(null);
    const [pending, setPending] = useState<"pro" | "premium" | null>(null);
    const [discountCode, setDiscountCode] = useState("");
    const pendingRef = useRef<"pro" | "premium" | null>(null);

    const { openPlanCheckout, status, error, confirmDialog } = useRazorpayCheckout({
        onAlreadyGranted: (data) => {
            const plan = pendingRef.current ?? "pro";
            pendingRef.current = null;
            setPending(null);
            if (data.discountPercent === 100) {
                setMessage(
                    `${plan === "premium" ? "Premium" : "Pro"} is unlocked with your scratch card — taking you home…`,
                );
            } else {
                setMessage(
                    `${plan === "premium" ? "Premium" : "Pro"} is already on this account — taking you home…`,
                );
            }
            window.location.assign(homeAfterUpgrade(plan));
        },
        onSuccess: (result) => {
            const plan =
                result?.kind === "premium" || result?.kind === "pro"
                    ? result.kind
                    : (pendingRef.current ?? "pro");
            pendingRef.current = null;
            setPending(null);
            setMessage(
                plan === "premium"
                    ? "Premium is active — taking you home…"
                    : "Pro is active — taking you home…",
            );
            // Full reload so homepage billing, locks, and Free labels refresh.
            window.location.assign(homeAfterUpgrade(plan));
        },
        onDismiss: () => {
            pendingRef.current = null;
            setPending(null);
            setMessage(CANCELLED_MESSAGE);
        },
        onError: (err) => {
            pendingRef.current = null;
            setPending(null);
            setMessage(err);
        },
    });

    async function upgrade(plan: "pro" | "premium") {
        if (!signedIn) {
            router.push(`/signin?next=${encodeURIComponent("/plans")}`);
            return;
        }
        if (!billing.paymentsReady) {
            setMessage(
                "Checkout is not set up on this server yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the server environment, then restart the app.",
            );
            return;
        }
        setMessage(null);
        pendingRef.current = plan;
        setPending(plan);
        await openPlanCheckout(plan, discountCode.trim() || undefined);
    }

    const current = billing.plan;
    const busy = status === "loading" || status === "open" || status === "verifying";

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
            {confirmDialog}

            <header className="space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                    User Plans
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Starter, Pro, or Premium
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    Upgrade once. Pro unlocks every Pro template and the Photo-rich look. Premium
                    unlocks every Premium template, every Pro template, and Animated. You do not buy
                    designs one at a time.
                </p>
                {signedIn ? (
                    <p className="text-sm text-muted-foreground">
                        Current plan:{" "}
                        <span className="font-medium text-foreground">
                            {PLAN_COPY[current].name}
                        </span>
                        {billing.paymentsReady ? (
                            <span className="text-muted-foreground"> · Razorpay checkout ready</span>
                        ) : null}
                    </p>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        <Link
                            href={`/signin?next=${encodeURIComponent("/plans")}`}
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                            Sign in
                        </Link>{" "}
                        to upgrade.
                    </p>
                )}
            </header>

            {signedIn ? (
                <DiscountCodeField
                    kind={pending === "premium" ? "premium" : "pro"}
                    value={discountCode}
                    onChange={setDiscountCode}
                    className="max-w-md"
                />
            ) : null}

            <div className="grid gap-5 lg:grid-cols-3">
                {ORDER.map((id) => {
                    const copy = PLAN_COPY[id];
                    const active = current === id;
                    const covered =
                        id === "starter"
                        || (id === "pro" && (current === "pro" || current === "premium"))
                        || (id === "premium" && current === "premium");
                    const popular = id === "pro" && !active;
                    const paid = id === "pro" || id === "premium";

                    return (
                        <article
                            key={id}
                            className={cn(
                                "flex flex-col rounded-2xl border bg-card/90 p-7",
                                active
                                    ? "border-gold/65 ring-2 ring-gold/45 shadow-[0_0_0_1px_color-mix(in_srgb,var(--gold)_40%,transparent),0_0_28px_color-mix(in_srgb,var(--gold)_32%,transparent),0_0_56px_color-mix(in_srgb,var(--gold)_16%,transparent)]"
                                    : "border-border/70 shadow-sm",
                            )}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <p className="text-base font-semibold text-foreground">{copy.name}</p>
                                {popular ? (
                                    <span className="rounded-full border border-gold/70 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
                                        Popular
                                    </span>
                                ) : null}
                            </div>

                            <p className="mt-3 flex items-baseline gap-2">
                                <span className="text-3xl font-bold tracking-tight text-foreground">
                                    {id === "starter" ? "Free" : `Rs ${PLAN_PRICE_INR[id]}`}
                                </span>
                                {paid ? (
                                    <span className="text-sm font-normal text-muted-foreground">
                                        once
                                    </span>
                                ) : null}
                            </p>

                            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                                {copy.description}
                            </p>

                            <ul className="mt-5 flex flex-1 flex-col gap-2.5 text-sm text-foreground">
                                {copy.points.map((point) => (
                                    <li key={point} className="flex gap-2.5">
                                        <Check
                                            className="mt-0.5 size-4 shrink-0 text-gold"
                                            strokeWidth={2.25}
                                            aria-hidden
                                        />
                                        <span>{point}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-6">
                                <PlanCta
                                    id={id}
                                    active={active}
                                    covered={covered && !active}
                                    busy={busy}
                                    pending={pending === id}
                                    paymentsReady={billing.paymentsReady}
                                    onUpgrade={(plan) => void upgrade(plan)}
                                />
                            </div>
                        </article>
                    );
                })}
            </div>

            {(message || error) && (
                <p
                    role="status"
                    className={cn(
                        "text-sm",
                        error || (message && message !== CANCELLED_MESSAGE && /couldn|failed|not set up|try again/i.test(message))
                            ? "text-destructive"
                            : "text-muted-foreground",
                    )}
                >
                    {error ?? message}
                </p>
            )}

            {!billing.paymentsReady ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                    Payments are not configured on this server yet. In production, set{" "}
                    <code className="font-mono text-xs">RAZORPAY_KEY_ID</code> and{" "}
                    <code className="font-mono text-xs">RAZORPAY_KEY_SECRET</code> in the Vercel
                    Production environment (see{" "}
                    <code className="font-mono text-xs">docs/production-payments-setup.md</code>
                    ), then redeploy.
                </p>
            ) : null}

            <p className="text-sm text-muted-foreground">
                AI rebuild limits follow your plan — Starter gets {FREE_GENERATIONS_PER_PROJECT}{" "}
                generations per site, Pro gets 5× that, Premium gets 15×.
            </p>
        </div>
    );
}
