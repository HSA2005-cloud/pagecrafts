import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/landing/SiteHeader";
import { PricingGuide } from "@/components/marketing/PricingGuide";
import { viewer } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Thin alias — signed-in users land on the home Pricing slide. */
export default async function PricingPage() {
    const user = await viewer();
    if (user) redirect("/?slide=pricing");

    return (
        <div className="relative min-h-dvh">
            <SiteHeader user={user} />
            <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 pb-16 pt-24">
                <Link
                    href="/#top"
                    className="w-fit rounded-md font-mono text-[11px] uppercase tracking-[0.22em] text-bloom-sky focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    ← Back to Home
                </Link>
                <PricingGuide />
            </main>
        </div>
    );
}
