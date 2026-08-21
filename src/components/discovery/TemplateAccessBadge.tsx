import { Lock } from "lucide-react";

import type { TemplateTier } from "@/lib/contracts";
import { lockLabelForTier } from "@/lib/plans/catalog";
import { cn } from "@/lib/utils";

// The lock a tile wears when the viewer's plan cannot use the design (R-plans, UI §13).
//
// It names the plan that unlocks it — "Pro" or "Premium" — rather than a rupee figure,
// because the design is not bought on its own any more; it comes with a plan.
export function TemplateAccessBadge({
    tier,
    className,
}: {
    tier: TemplateTier;
    className?: string;
}) {
    const plan = lockLabelForTier(tier);
    const tone =
        tier === "signature"
            ? "bg-red-600 text-white"
            : "bg-amber-400 text-neutral-900";

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
                tone,
                className,
            )}
        >
            <Lock className="size-3" strokeWidth={2.5} aria-hidden />
            {plan}
        </span>
    );
}
