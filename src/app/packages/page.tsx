import Link from "next/link";

import { viewer } from "@/lib/auth/session";
import { supabaseViewerClient } from "@/lib/auth/server";
import { getBilling } from "@/lib/payments/checkout";
import { paymentsConfigured } from "@/lib/payments/razorpay";
import { DEFAULT_BILLING } from "@/lib/contracts";
import { PackagesPanel } from "@/components/settings/PackagesPanel";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
    const user = await viewer();

    // Keep paymentsReady honest even if entitlements fetch fails — otherwise the panel
    // shows "not configured" whenever billing throws, which is unrelated to Razorpay keys.
    const emptyBilling = { ...DEFAULT_BILLING, paymentsReady: paymentsConfigured() };
    let billing = emptyBilling;
    if (user) {
        try {
            const supabase = await supabaseViewerClient();
            billing = await getBilling(supabase, user.id);
        } catch {
            billing = emptyBilling;
        }
    }

    return (
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 pb-16 pt-8">
            <Link
                href="/#build"
                className="w-fit rounded-md font-mono text-[11px] uppercase tracking-[0.22em] text-bloom-sky focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                ← Back to Build
            </Link>
            {user ? (
                <PackagesPanel initial={billing} />
            ) : (
                <div className="space-y-4">
                    <h1 className="text-3xl font-bold tracking-tight">More AI rebuilds</h1>
                    <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                        Sign in to add more AI rebuilds when a site has used its free rounds.
                    </p>
                    <Link
                        href="/signin"
                        className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    >
                        Sign in
                    </Link>
                </div>
            )}
        </main>
    );
}
