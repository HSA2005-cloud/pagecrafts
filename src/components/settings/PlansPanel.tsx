"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useRazorpayCheckout } from "@/hooks/useRazorpayCheckout";
import { waitForPlanGrant } from "@/lib/payments/wait-for-pro";
import type { AccountPlan, BillingSummary } from "@/lib/contracts";
import { PLAN_COPY, PLAN_PRICE_INR } from "@/lib/payments/plans";
import { cn } from "@/lib/utils";

const ORDER: AccountPlan[] = ["starter", "pro", "premium"];

export function PlansPanel({
    initial,
    signedIn,
}: {
    initial: BillingSummary;
    signedIn: boolean;
}) {
    const router = useRouter();
    const [billing, setBilling] = useState(initial);
    const [message, setMessage] = useState<string | null>(null);
    const [pending, setPending] = useState<"pro" | "premium" | null>(null);

    const refresh = useCallback(async () => {
        const { apiGet } = await import("@/lib/api/client");
        const { data } = await apiGet<BillingSummary>("/api/v1/account/billing");
        if (data) setBilling(data);
        router.refresh();
    }, [router]);

    const { openPlanCheckout, status, error, confirmDialog } = useRazorpayCheckout({
        onAlreadyGranted: () => {
            setPending(null);
            setMessage("That plan is already on this account.");
            void refresh();
        },
        onSuccess: () => {
            const plan = pending;
            setPending(null);
            if (!plan) return;
            setMessage("Payment received. Unlocking…");
            void (async () => {
                const ok = await waitForPlanGrant(plan);
                setMessage(
                    ok
                        ? `${plan === "premium" ? "Premium" : "Pro"} is active — every matching design is unlocked.`
                        : "Payment went through. If the plan is not showing yet, refresh in a moment.",
                );
                await refresh();
            })();
        },
        onDismiss: () => setPending(null),
        onError: (err) => {
            setPending(null);
            setMessage(err);
        },
    });

    async function upgrade(plan: "pro" | "premium") {
        if (!signedIn) {
            router.push(`/signin?next=${encodeURIComponent("/plans")}`);
            return;
        }
        setMessage(null);
        setPending(plan);
        await openPlanCheckout(plan);
    }

    const current = billing.plan;
    const busy = status === "loading" || status === "open" || status === "verifying";

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
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

            <div className="grid gap-4 sm:grid-cols-3">
                {ORDER.map((id) => {
                    const copy = PLAN_COPY[id];
                    const active = current === id;
                    const covered =
                        id === "starter"
                        || (id === "pro" && (current === "pro" || current === "premium"))
                        || (id === "premium" && current === "premium");
                    const price =
                        id === "starter"
                            ? "Free"
                            : `Rs ${PLAN_PRICE_INR[id]}`;

                    return (
                        <article
                            key={id}
                            className={cn(
                                "flex flex-col rounded-2xl border border-border p-5",
                                active && "ring-2 ring-primary/40",
                            )}
                        >
                            <p className="text-sm font-medium text-muted-foreground">{copy.name}</p>
                            <p className="mt-1 text-2xl font-bold text-foreground">{price}</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                {copy.description}
                            </p>
                            <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-foreground">
                                {copy.points.map((point) => (
                                    <li key={point} className="flex gap-2">
                                        <Check
                                            className="mt-0.5 size-4 shrink-0 text-primary"
                                            aria-hidden
                                        />
                                        <span>{point}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-5">
                                {covered ? (
                                    <p className="text-sm font-medium text-muted-foreground">
                                        {active ? "Your plan" : "Included"}
                                    </p>
                                ) : id === "pro" || id === "premium" ? (
                                    <Button
                                        type="button"
                                        variant="brand"
                                        className="min-h-11 w-full cursor-pointer font-semibold"
                                        disabled={busy}
                                        onClick={() => void upgrade(id)}
                                    >
                                        {busy && pending === id
                                            ? "Opening Razorpay…"
                                            : `Upgrade to ${copy.name}`}
                                    </Button>
                                ) : null}
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
                        error ? "text-destructive" : "text-muted-foreground",
                    )}
                >
                    {error ?? message}
                </p>
            )}

            <p className="text-sm text-muted-foreground">
                Need more AI rebuilds on a site? That is separate —{" "}
                <Link
                    href="/packages"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                    manage AI usage
                </Link>
                .
            </p>
        </div>
    );
}
