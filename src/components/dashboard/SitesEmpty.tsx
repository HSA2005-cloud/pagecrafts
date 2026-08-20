import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

// Nothing yet — which is a beginning, not a fault. So it offers the one thing worth doing
// rather than apologising for being empty.
export function SitesEmpty() {
    return (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
            <p className="text-base font-semibold text-foreground">No sites yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Describe the site you want and PageCrafts will build a first draft you can edit.
            </p>

            <Link
                href="/#build"
                className={buttonVariants({
                    variant: "brand",
                    className: "mt-6 rounded-xl font-semibold",
                })}
            >
                <Plus aria-hidden />
                Make your first site
            </Link>
        </div>
    );
}

// A failed read, which must never be dressed up as an empty account. Someone with three
// sites who is shown "no sites yet" will reasonably think they have lost them.
export function SitesError() {
    return (
        <div className="rounded-2xl border border-border bg-card/60 px-6 py-10 text-center">
            <p className="text-base font-semibold text-foreground">We could not load your sites</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Nothing has happened to them — this is a problem at our end. Please refresh the
                page.
            </p>
        </div>
    );
}
