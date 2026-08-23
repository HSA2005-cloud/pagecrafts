"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/contracts";
import { PLAN_RANK } from "@/lib/contracts";
import { startUpgrade } from "./checkout";

interface CatalogueEntry {
    plan: Plan;
    label: string;
    priceInr: number;
    current: boolean;
}

export interface PlanView {
    plan: Plan;
    catalogue: CatalogueEntry[];
}

// What each plan includes, in plain product terms. Copy, not authorization — the gates live
// on the server.
const FEATURES: Record<Plan, string[]> = {
    starter: [
        "Free designs",
        "Build & edit sites",
        "Limited AI generations per site",
        "Publish free designs at no cost",
    ],
    pro: [
        "Everything in Starter",
        "Pro (premium) designs unlocked",
        "Unlimited AI generations",
        "Publish any design — no per-site checkout",
        "Keep editing live sites",
    ],
    premium: [
        "Everything in Pro",
        "Premium (signature) designs unlocked",
        "Highest priority support",
    ],
};

export function PlansPanel({ initial, signedIn }: { initial: PlanView; signedIn: boolean }) {
    const router = useRouter();
    const [busy, setBusy] = useState<Plan | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    async function upgrade(plan: Plan) {
        if (plan === "starter") return;
        if (!signedIn) {
            setNotice("Please sign in to upgrade.");
            return;
        }
        setNotice(null);
        setBusy(plan);
        const outcome = await startUpgrade(plan);
        setBusy(null);

        if (outcome.status === "upgraded") {
            setNotice(`You are now on the ${outcome.plan} plan.`);
            // Re-run the server component so the current-plan highlight reflects the database.
            router.refresh();
        } else if (outcome.status === "error") {
            setNotice(outcome.message);
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {notice && (
                <p role="status" className="rounded-lg border border-border bg-secondary p-3 text-sm">
                    {notice}
                </p>
            )}

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {initial.catalogue.map((entry) => {
                    const isCurrent = entry.current;
                    const isUpgrade = PLAN_RANK[entry.plan] > PLAN_RANK[initial.plan];

                    return (
                        <div
                            key={entry.plan}
                            className={cn(
                                "flex flex-col gap-4 rounded-2xl border p-6",
                                isCurrent
                                    ? "border-primary/60 bg-accent/40 ring-1 ring-primary/30"
                                    : "border-border bg-card/50",
                            )}
                        >
                            <div className="flex items-baseline justify-between">
                                <h2 className="text-lg font-semibold text-foreground">{entry.label}</h2>
                                {isCurrent && (
                                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                                        Current plan
                                    </span>
                                )}
                            </div>

                            <p className="text-2xl font-bold text-foreground">
                                {entry.priceInr === 0 ? "Free" : `Rs ${entry.priceInr}`}
                                {entry.priceInr > 0 && (
                                    <span className="text-sm font-normal text-muted-foreground"> one-time</span>
                                )}
                            </p>

                            <ul className="flex flex-1 flex-col gap-2 text-sm text-muted-foreground">
                                {FEATURES[entry.plan].map((feature) => (
                                    <li key={feature} className="flex items-start gap-2">
                                        <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            {isCurrent ? (
                                <Button variant="outline" disabled className="w-full">
                                    Current plan
                                </Button>
                            ) : isUpgrade ? (
                                <Button
                                    variant="brand"
                                    className="w-full"
                                    disabled={busy !== null}
                                    onClick={() => upgrade(entry.plan)}
                                >
                                    {busy === entry.plan ? "Opening checkout…" : `Upgrade to ${entry.label}`}
                                </Button>
                            ) : (
                                <Button variant="outline" disabled className="w-full">
                                    Included
                                </Button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
