import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function LandingClose() {
    return (
        <div data-reveal className="flex flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-brand-ink">
                Ready when you are
            </p>
            <h2 className="mt-4 max-w-xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Tell us the business. We will write the site.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
                Name, place, and what they do. Then pick a look and go live when it feels right.
            </p>
            <Link
                href="/new"
                className={buttonVariants({
                    variant: "brand",
                    size: "xl",
                    className: "mt-8 w-fit rounded-xl font-semibold",
                })}
            >
                Ask AI to create a website
                <ArrowRight aria-hidden />
            </Link>
            <p className="mt-6 text-sm text-muted-foreground">
                PageCrafts — building is free. You pay Rs 249 only when you go live.
            </p>
        </div>
    );
}
