import { Lock } from "lucide-react";

import type { TemplateTier } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { templateTileLabel } from "@/lib/payments/pricing";

const TIER_BADGE: Record<TemplateTier, string> = {
    free: "border border-border bg-background/85 text-foreground backdrop-blur-sm",
    premium: "bg-primary text-primary-foreground",
    signature: "brand-gradient text-primary-foreground",
};

export function PriceBadge({
    tier,
    priceInr,
    className,
    locked = false,
    unlocked = false,
}: {
    tier: TemplateTier;
    priceInr: number;
    className?: string;
    locked?: boolean;
    unlocked?: boolean;
}) {
    const label = templateTileLabel(tier, { unlocked });
    const visualTier = unlocked && tier !== "free" ? "free" : tier;

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
                TIER_BADGE[visualTier],
                className,
            )}
        >
            {locked ? <Lock className="size-3" strokeWidth={2} aria-hidden /> : null}
            {label}
        </span>
    );
}
