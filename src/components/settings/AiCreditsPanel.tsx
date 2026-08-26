"use client";

import Link from "next/link";

import type { BillingSummary } from "@/lib/contracts";
import { ACCOUNT_PLAN_LABEL } from "@/lib/contracts";
import { generationsLimitForPlan, PLAN_COPY } from "@/lib/payments/plans";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Account Settings block for plan AI allowance.
 * Credits are per site (Starter 3 / Pro 15 / Premium 45), not a separate wallet.
 */
export function AiCreditsPanel({ billing }: { billing: BillingSummary }) {
    const plan = billing.plan;
    const limit = generationsLimitForPlan(plan);
    const planName = ACCOUNT_PLAN_LABEL[plan];
    const passes = billing.generationPasses;
    const canUpgrade = plan !== "premium";

    return (
        <div id="ai-credits" className="scroll-mt-24 rounded-2xl glass-panel p-5">
            <p className="text-base font-semibold text-foreground">AI credits</p>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Each site gets a set number of AI builds on your plan. Used up on one site does not
                spend another site&apos;s allowance.
            </p>

            <dl className="mt-4 space-y-3 text-sm">
                <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Current plan</dt>
                    <dd className="font-medium text-foreground">{planName}</dd>
                </div>
                <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
                    <dt className="text-muted-foreground">AI builds per site</dt>
                    <dd className="font-medium text-foreground">
                        {limit} on {planName}
                    </dd>
                </div>
                <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Extra generation passes</dt>
                    <dd className="font-medium text-foreground">
                        {passes === 0 ? "None" : passes}
                    </dd>
                </div>
                <div className="flex min-h-9 flex-wrap items-start justify-between gap-2">
                    <dt className="text-muted-foreground">By plan</dt>
                    <dd className="text-right text-muted-foreground">
                        <ul className="space-y-1">
                            <li>
                                <span className="text-foreground">{PLAN_COPY.starter.name}</span>
                                {" — "}
                                {generationsLimitForPlan("starter")} per site
                            </li>
                            <li>
                                <span className="text-foreground">{PLAN_COPY.pro.name}</span>
                                {" — "}
                                {generationsLimitForPlan("pro")} per site
                            </li>
                            <li>
                                <span className="text-foreground">{PLAN_COPY.premium.name}</span>
                                {" — "}
                                {generationsLimitForPlan("premium")} per site
                            </li>
                        </ul>
                    </dd>
                </div>
            </dl>

            {canUpgrade ? (
                <div className="mt-4">
                    <Link
                        href="/plans"
                        className={cn(
                            buttonVariants({
                                variant: "brand",
                                className: "min-h-11 cursor-pointer font-semibold",
                            }),
                        )}
                    >
                        {plan === "starter" ? "Get more AI on User Plans" : "Upgrade for more AI"}
                    </Link>
                </div>
            ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                    Premium includes the highest AI allowance per site.
                </p>
            )}
        </div>
    );
}
