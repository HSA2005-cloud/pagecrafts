import Link from "next/link";

import type { TemplateTier } from "@/lib/contracts";
import { buttonVariants } from "@/components/ui/button";

// "Use this design" (R3 D8).
//
// The button used to fork immediately into the editor, with the template's own placeholder
// words still on the page. It now takes them to the same brief screen as "Ask AI" — name,
// place, what they do — and those facts replace the placeholders on this design.

export function UseDesignButton({
    forkId,
    name,
    tier,
    showPayNote = true,
    unlocked = false,
}: {
    forkId: string;
    name: string;
    tier: TemplateTier;
    showPayNote?: boolean;
    unlocked?: boolean;
}) {
    const href = `/new?template=${encodeURIComponent(forkId)}`;
    const needsPlan = tier !== "free" && !unlocked;

    return (
        <div className="flex flex-col items-end gap-1.5">
            <Link
                href={href}
                aria-label={`Use ${name}`}
                className={buttonVariants({ variant: "brand", size: "lg" }) + " cursor-pointer"}
            >
                Use this design
            </Link>
            {showPayNote && needsPlan ? (
                <span className="text-xs text-muted-foreground">
                    {tier === "signature"
                        ? "Needs Premium on User Plans."
                        : "Needs Pro on User Plans."}
                </span>
            ) : null}
        </div>
    );
}
