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
}: {
    forkId: string;
    name: string;
    tier: TemplateTier;
    showPayNote?: boolean;
}) {
    const href = `/new?template=${encodeURIComponent(forkId)}`;

    return (
        <div className="flex flex-col items-end gap-1.5">
            <Link
                href={href}
                aria-label={`Use ${name}`}
                className={buttonVariants({ variant: "brand", size: "lg" })}
            >
                Use this design
            </Link>
            {showPayNote && tier !== "free" ? (
                <span className="text-xs text-muted-foreground">
                    You will be asked to pay for this design once, before it is set up.
                </span>
            ) : null}
        </div>
    );
}
