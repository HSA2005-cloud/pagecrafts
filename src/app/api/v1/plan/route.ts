import "server-only";
import { supabaseRoute } from "@/lib/auth/session";
import { resolvePlan } from "@/lib/data/entitlements";
import { PLANS, PLAN_LABEL, PLAN_PRICE_INR, type Plan } from "@/lib/contracts";
import { ok, fail, guard } from "@/lib/errors/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/plan — the current plan (server-authoritative) plus the plan catalogue the
// User Plans page renders. The current plan is derived from entitlements, so it is correct
// after refresh, re-login, or in another browser.
export async function GET() {
  return guard(async () => {
    const supabase = await supabaseRoute();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return fail("unauthorized", "Sign in to see your plan.");
    }

    const current = await resolvePlan(supabase, data.user.id);

    const catalogue = PLANS.map((plan: Plan) => ({
      plan,
      label: PLAN_LABEL[plan],
      priceInr: plan === "starter" ? 0 : PLAN_PRICE_INR[plan],
      current: plan === current,
    }));

    return ok({ plan: current, catalogue });
  });
}
