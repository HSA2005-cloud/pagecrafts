import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/landing/SiteHeader";
import { LookCompareDemo } from "@/components/marketing/LookCompareDemo";
import { viewer } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Thin alias — signed-in users land on the home Compare slide. */
export default async function ComparePage() {
    const user = await viewer();
    if (user) redirect("/?slide=compare");

    return (
        <div className="relative min-h-dvh">
            <SiteHeader user={user} />
            <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-16 pt-24">
                <Link
                    href="/#top"
                    className="w-fit rounded-md font-mono text-[11px] uppercase tracking-[0.22em] text-bloom-sky focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    ← Back to Home
                </Link>
                <LookCompareDemo />
            </main>
        </div>
    );
}
