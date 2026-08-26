import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown when a site has used its plan AI allowance. */
export function AiCreditsNotice({ className }: { className?: string }) {
    return (
        <div
            className={cn(
                "flex flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 text-center",
                className,
            )}
            role="status"
        >
            <p className="text-sm leading-6 text-muted-foreground">
                You&apos;re out of AI credits on this site. Check Settings → AI credits, or upgrade
                on User Plans for more builds per site.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
                <Link
                    href="/?slide=settings"
                    className={buttonVariants({
                        variant: "outline",
                        className: "min-h-11 cursor-pointer rounded-lg px-5 font-semibold",
                    })}
                >
                    AI credits
                </Link>
                <Link
                    href="/plans"
                    className={buttonVariants({
                        variant: "brand",
                        className: "min-h-11 cursor-pointer rounded-lg px-5 font-semibold",
                    })}
                >
                    Upgrade
                </Link>
            </div>
        </div>
    );
}