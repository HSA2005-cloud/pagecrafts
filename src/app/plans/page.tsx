import Link from "next/link";

import { viewer } from "@/lib/auth/session";
import { supabaseViewerClient } from "@/lib/auth/server";
import { getBilling } from "@/lib/payments/checkout";
import { paymentsConfigured } from "@/lib/payments/razorpay";
import { DEFAULT_BILLING } from "@/lib/contracts";
import { PlansPanel } from "@/components/settings/PlansPanel";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
    const user = await viewer();

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
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-16 pt-8">
            <Link
                href="/templates"
                className="w-fit rounded-md font-mono text-[11px] uppercase tracking-[0.22em] text-bloom-sky focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                ← Back to designs
            </Link>
            <PlansPanel initial={billing} signedIn={Boolean(user)} />
        </main>
    );
}
