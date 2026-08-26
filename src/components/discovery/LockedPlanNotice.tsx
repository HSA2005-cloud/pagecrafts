"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { PaidBadge } from "@/lib/payments/pricing";
import { PREMIUM_PRICE_INR, PRO_PRICE_INR } from "@/lib/payments/pricing";
import { cn } from "@/lib/utils";

/**
 * Locked Pro/Premium design or look — no per-item buy.
 * Send them to User Plans to upgrade the account.
 */
export function LockedPlanNotice({
    badge,
    kind = "design",
    className,
}: {
    badge: PaidBadge;
    kind?: "design" | "look";
    className?: string;
}) {
    const price = badge === "Premium" ? PREMIUM_PRICE_INR : PRO_PRICE_INR;
    const noun = kind === "look" ? "look" : "design";

    return (
        <div
            className={cn(
                "flex w-full flex-wrap items-center justify-end gap-3",
                className,
            )}
        >
            <div className="mr-auto flex min-w-0 flex-col gap-0.5">
                <p className="text-base font-semibold text-foreground">
                    This is a {badge} {noun}
                </p>
                <p className="text-sm text-muted-foreground">
                    You need the {badge} plan (Rs {price}) on your account to use it. Plans unlock
                    every {badge} {kind === "look" ? "look and matching templates" : "template"}
                    {badge === "Premium" ? ", plus Pro" : ""}.
                </p>
            </div>
            <Link
                href="/plans"
                className={cn(
                    buttonVariants({
                        variant: "brand",
                        size: "lg",
                        className: "min-h-11 cursor-pointer font-semibold",
                    }),
                )}
            >
                Upgrade to {badge}
            </Link>
        </div>
    );
}
