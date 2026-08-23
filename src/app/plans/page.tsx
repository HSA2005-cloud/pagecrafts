import { supabaseViewerClient } from "@/lib/auth/server";
import { resolvePlan } from "@/lib/data/entitlements";
import { PLANS, PLAN_LABEL, PLAN_PRICE_INR, type Plan } from "@/lib/contracts";
import { PlansPanel } from "@/components/plans/PlansPanel";

// Screen — User Plans. The current plan is resolved on the server from the database
// (entitlements), so the highlighted plan is whatever this account actually holds — correct
// after a refresh, a re-login, or in another browser. After an upgrade the panel calls
// router.refresh(), which re-runs this server component and re-reads the plan.
export default async function PlansPage() {
    const supabase = await supabaseViewerClient();
    const { data } = await supabase.auth.getUser();
    const current: Plan = data.user ? await resolvePlan(supabase, data.user.id) : "starter";

    const catalogue = PLANS.map((plan) => ({
        plan,
        label: PLAN_LABEL[plan],
        priceInr: plan === "starter" ? 0 : PLAN_PRICE_INR[plan],
        current: plan === current,
    }));

    return (
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-12 pt-8">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Plans</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                    Upgrade to unlock more designs, unlimited AI generations, and publishing
                    without a per-site checkout. Payments run in Razorpay test mode.
                </p>
            </header>

            <PlansPanel initial={{ plan: current, catalogue }} signedIn={!!data.user} />
        </main>
    );
}
