import "server-only";

import { supabaseAdmin } from "@/lib/data/supabase-admin";
import { resolvePlan } from "@/lib/data/entitlements";
import { STARTER_AI_PER_SITE } from "@/lib/limits/config";
import type { GenerationCounters } from "./budget";

// The production generation counters, backed by the database (E-1 M7.1).
//
// This replaces the permissive stub in budget.ts. It answers the one plan-aware question the
// budget check needs — is this site's Starter AI allowance spent? — by counting rows in
// `public.generations` for the project and comparing against STARTER_AI_PER_SITE. Pro and
// Premium accounts are not capped per site, so the count is skipped for them.
//
// It serves its own service-role client rather than taking the request's, because the budget
// interface hands methods only an id: projectBudgetExhausted needs the project's owner and
// that owner's plan, which a per-request RLS client scoped to the caller could not read for
// an arbitrary project. Reading is safe under the service role here; nothing is written.
//
// The daily/hourly abuse caps are enforced separately by guardAiRequest (Redis) for everyone,
// so this counter deliberately does not add a second daily limit.
export const supabaseCounters: GenerationCounters = {
    async userDailyUsed() {
        return 0;
    },
    userDailyLimit() {
        return Number.MAX_SAFE_INTEGER;
    },
    async projectBudgetExhausted(projectId: string): Promise<boolean> {
        const admin = supabaseAdmin();

        const { data: project } = await admin
            .from("projects")
            .select("user_id")
            .eq("id", projectId)
            .maybeSingle();

        const ownerId = (project as { user_id: string } | null)?.user_id;
        if (!ownerId) return false;

        // Pro and Premium are not subject to the Starter per-site cap.
        if ((await resolvePlan(admin, ownerId)) !== "starter") return false;

        const { count, error } = await admin
            .from("generations")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId);

        if (error) return false;
        return (count ?? 0) >= STARTER_AI_PER_SITE;
    },
};

/**
 * Best-effort record that a generation was dispatched for this site, so the per-site counter
 * can see it. Never throws: a lost ledger row must not fail a generation the user asked for.
 * Uses the caller's RLS client (owner may insert their own rows).
 */
export async function recordGenerationDispatch(
    supabase: { from?: unknown },
    userId: string,
    projectId: string,
    prompt: string,
): Promise<void> {
    try {
        if (typeof supabase.from !== "function") return;
        await (supabase as import("@supabase/supabase-js").SupabaseClient)
            .from("generations")
            .insert({
                user_id: userId,
                project_id: projectId,
                prompt,
                model: "pending",
                input_tokens: 0,
                output_tokens: 0,
                cost_cents: 0,
                status: "completed",
                stage: "dispatch",
            });
    } catch (error) {
        console.error("[generations] could not record dispatch", {
            projectId,
            reason: error instanceof Error ? error.message : String(error),
        });
    }
}
