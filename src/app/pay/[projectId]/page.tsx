import { PaySheet } from "@/components/pay/PaySheet";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { supabaseAdminOrNull } from "@/lib/data/supabase-admin";
import { isValidUpiId, normaliseUpiId } from "@/lib/sites/upi";
import type { SiteMeta } from "@/lib/contracts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PayPage({
    params,
}: {
    params: Promise<{ projectId: string }>;
}) {
    const { projectId } = await params;
    const admin = supabaseAdminOrNull();

    if (!admin) {
        return (
            <div className="relative">
                <SiteHeader minimal />
                <main className="mx-auto max-w-lg px-6 py-24 text-center">
                    <h1 className="font-display text-3xl font-bold">Payment page unavailable</h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        This environment cannot load shop payment details just now.
                    </p>
                </main>
            </div>
        );
    }

    const { data } = await admin
        .from("projects")
        .select("id, name, site_meta")
        .eq("id", projectId)
        .maybeSingle();

    const meta = (data?.site_meta as SiteMeta | null) ?? {};
    const upiId = meta.upiId?.trim() ? normaliseUpiId(meta.upiId) : "";

    if (!data || !upiId || !isValidUpiId(upiId)) {
        return (
            <div className="relative">
                <SiteHeader minimal />
                <main className="mx-auto max-w-lg px-6 py-24 text-center">
                    <h1 className="font-display text-3xl font-bold">Payments are not set up</h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        The site owner has not added a UPI ID yet. Ask them to save one in site
                        settings, or try the demo payment page.
                    </p>
                    <Link
                        href="/pay/demo"
                        className="mt-8 inline-flex min-h-11 items-center rounded-full border border-gold bg-gold px-5 text-sm font-semibold text-gold-foreground"
                    >
                        Open the demo
                    </Link>
                </main>
            </div>
        );
    }

    return (
        <div className="relative">
            <SiteHeader minimal />
            <PaySheet
                businessName={meta.title?.trim() || data.name || "This shop"}
                upiId={upiId}
            />
        </div>
    );
}
