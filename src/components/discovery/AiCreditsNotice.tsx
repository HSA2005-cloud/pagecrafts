import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown when a site has used its plan AI allowance. Links to User Plans (/plans). */
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
                You&apos;re out of credits. Upgrade to build more.
            </p>
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
    );
}
