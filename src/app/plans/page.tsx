import { supabaseViewerClient } from "@/lib/auth/server";
import { getStoredPlan } from "@/lib/data/plan";
import { PlanCards } from "@/components/plans/PlanCards";
import type { PlanId } from "@/lib/plans/catalog";

export const dynamic = "force-dynamic";

// User Plans (R-plans). The current plan is read here, on the server, from the authenticated
// user's row — never inferred on the client — so a refresh, a new device or a cleared
// browser all show the same answer.
export default async function PlansPage() {
    let currentPlan: PlanId = "starter";
    try {
        const supabase = await supabaseViewerClient();
        currentPlan = await getStoredPlan(supabase);
    } catch {
        currentPlan = "starter";
    }

    return (
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-16 pt-10">
            <header className="flex flex-col gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    User Plans
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    One-time unlocks, paid once through Razorpay — not subscriptions. Your plan
                    decides which templates you can use and whether publishing and AI generations
                    are included.
                </p>
            </header>

            <PlanCards currentPlan={currentPlan} />
        </main>
    );
}
