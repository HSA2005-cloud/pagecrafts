import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// "Use this design" (R3 D8).
//
// The button used to fork immediately into the editor, with the template's own placeholder
// words still on the page. It now takes them to the same brief screen as "Ask AI" — name,
// place, what they do — and those facts replace the placeholders on this design.
//
// It only renders once the design is unlocked for the viewer's plan (R-plans), so there is
// no per-design payment note here any more — access came with the plan.

export function UseDesignButton({ forkId, name }: { forkId: string; name: string }) {
    const href = `/new?template=${encodeURIComponent(forkId)}`;

    return (
        <Link
            href={href}
            aria-label={`Use ${name}`}
            className={buttonVariants({ variant: "brand", size: "lg" })}
        >
            Use this design
        </Link>
    );
}
