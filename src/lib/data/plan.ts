import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/errors/respond";
import { supabaseAdmin } from "./supabase-admin";
import { type PlanId, maxPlan, toPlanId } from "@/lib/plans/catalog";

// The account plan, read and written server-side (R-plans).
//
// Read through the caller's own client so RLS decides whose plan this is — there is no user
// id parameter on the read for the same reason account.ts has none. Written only through the
// service role: `plan` is not in the authenticated update grant, so this is the only path
// that can move it, which is what makes the paywall real rather than polite.

function missingPlanColumn(message: string): boolean {
    return (
        /column .*plan.* does not exist/i.test(message) ||
        /could not find .*plan.* column/i.test(message)
    );
}

/**
 * This account's plan, or 'starter' when it cannot be read.
 *
 * A missing column (a database that has not run the plans migration yet) reads as starter
 * rather than an error: the safe direction to fail is "no paid features", never "locked out".
 */
export async function getStoredPlan(supabase: SupabaseClient): Promise<PlanId> {
    const { data, error } = await supabase.from("users").select("plan").maybeSingle();

    if (error) {
        if (missingPlanColumn(error.message)) return "starter";
        throw new ApiError("internal", "Could not read your plan.", error.message);
    }

    return toPlanId(data?.plan);
}

/**
 * Move an account to a plan, never below the one it already holds.
 *
 * Called after a verified payment (or a signed webhook), always with the service role. The
 * max() guard means a stale callback for a Pro order can never pull a Premium account back
 * down, and re-applying the same purchase is a no-op.
 */
export async function setUserPlan(userId: string, plan: PlanId): Promise<PlanId> {
    const admin = supabaseAdmin();

    const current = await admin.from("users").select("plan").eq("id", userId).maybeSingle();
    if (current.error) {
        throw new ApiError("internal", "Could not read your plan.", current.error.message);
    }

    const next = maxPlan(toPlanId(current.data?.plan), plan);

    const { error } = await admin.from("users").update({ plan: next }).eq("id", userId);
    if (error) {
        throw new ApiError("internal", "Could not update your plan.", error.message);
    }

    return next;
}
