import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntitlementCheck, EntitlementKind, EntitlementSource, AccountPlan } from "@/lib/contracts";
import { ApiError } from "@/lib/errors/respond";
import { requiredPlanForTemplate } from "@/lib/payments/pricing";
import { supabaseAdminOrNull } from "./supabase-admin";

// The server-side entitlement check (R3 D9, A-5, Doc 22 §6).
//
// The table has existed since D5 and nothing read it until the fork gate at D8. This is the
// rest: the question publish asks before it puts a site live, and the same question the
// post-publish edit path asks before it reopens editing.
//
// Two properties matter more than the mechanics.
//
// It is read here, from the database, and never taken from the request. A client that can
// say "I am entitled" is a client that can publish for free, and no amount of UI politeness
// changes that.
//
// It is a read, not a charge. Asking twice grants twice and costs nothing, which is what
// makes a retried publish safe: the second attempt finds the grant the first one was made
// under, rather than reaching for a payment that has already been taken.

interface EntitlementRow {
    kind: EntitlementKind;
    source: EntitlementSource;
    status: string;
    expires_at: string | null;
    template_id?: string | null;
    style_id?: string | null;
}

/**
 * Whether a row is a grant *now*.
 *
 * status and expires_at are separate columns and they can disagree: a subscription that
 * lapsed at midnight still reads 'active' until something sweeps it, and nothing sweeps it
 * today. Trusting status alone would keep a lapsed account publishing indefinitely, so the
 * date is part of the question rather than a tidy-up job somebody has to remember to run.
 */
function isLive(row: EntitlementRow, now: Date): boolean {
    if (row.status !== "active") return false;
    if (!row.expires_at) return true;

    const expiry = Date.parse(row.expires_at);
    return Number.isNaN(expiry) ? false : expiry > now.getTime();
}

async function liveEntitlements(
    supabase: SupabaseClient,
    userId: string,
    projectId: string | null,
): Promise<EntitlementRow[]> {
    // Per-user rows (pro) carry no project, so both are fetched in one go and sorted out
    // here — one round trip rather than one per kind.
    const { data, error } = await supabase
        .from("entitlements")
        .select("kind, source, status, expires_at, project_id, template_id, style_id")
        .eq("user_id", userId);
    if (error) throw new ApiError("internal", "Could not check your account.", error.message);

    const now = new Date();
    return (data ?? [])
        .filter((row) => {
            const r = row as unknown as EntitlementRow & { project_id: string | null };
            if (!isLive(r, now)) return false;
            // Account-scoped grants count always; a project-scoped grant only for its project.
            return (
                r.kind === "pro" ||
                r.kind === "premium" ||
                r.kind === "advanced" ||
                r.kind === "template" ||
                r.kind === "style" ||
                r.project_id === projectId
            );
        })
        .map((row) => row as unknown as EntitlementRow);
}

/**
 * Does this account hold `kind` for this project?
 *
 * `pro` satisfies everything: a subscription that did not cover publishing would be a
 * subscription nobody could describe. It is reported as granted with source `pro`, so a
 * caller can still tell a subscription apart from a one-off purchase.
 */
export async function checkEntitlement(
    supabase: SupabaseClient,
    userId: string,
    projectId: string | null,
    kind: EntitlementKind,
): Promise<EntitlementCheck> {
    const rows = await liveEntitlements(supabase, userId, projectId);

    const exact = rows.find((row) => row.kind === kind);
    if (exact) {
        return { kind, granted: true, source: exact.source, expiresAt: exact.expires_at };
    }

    // AI Advanced is bought separately — legacy Pro/Premium never unlock it.
    if (kind === "advanced") {
        return { kind, granted: false };
    }

    // Premium covers Pro and every per-project kind. Pro covers those kinds but not Premium.
    const premium = rows.find((row) => row.kind === "premium");
    if (premium && kind !== "premium") {
        return { kind, granted: true, source: "pro", expiresAt: premium.expires_at };
    }

    const pro = rows.find((row) => row.kind === "pro");
    if (pro && kind !== "premium") return { kind, granted: true, source: "pro", expiresAt: pro.expires_at };

    return { kind, granted: false };
}

/** True when the account holds a live Pro or Premium plan. Premium covers Pro. */
export async function hasPro(supabase: SupabaseClient, userId: string): Promise<boolean> {
    return (await checkEntitlement(supabase, userId, null, "pro")).granted;
}

/** True when the account holds a live Premium plan. Pro does not cover this. */
export async function hasPremium(supabase: SupabaseClient, userId: string): Promise<boolean> {
    return (await checkEntitlement(supabase, userId, null, "premium")).granted;
}

/** Live account plan from entitlements — Starter when no paid plan row is active. */
export async function accountPlan(
    supabase: SupabaseClient,
    userId: string,
): Promise<AccountPlan> {
    if (await hasPremium(supabase, userId)) return "premium";
    if (await hasPro(supabase, userId)) return "pro";
    return "starter";
}

/** True when the account holds the Advanced AI usage package. */
export async function hasAdvanced(supabase: SupabaseClient, userId: string): Promise<boolean> {
    return (await checkEntitlement(supabase, userId, null, "advanced")).granted;
}

export const PAID_DESIGN_MESSAGE =
    "This design needs Pro or Premium. Upgrade your plan with Razorpay — Pro unlocks all Pro designs; Premium unlocks all Premium designs.";

/**
 * Opening a paid catalogue design.
 *
 * A Pro plan unlocks every Pro (`premium` tier) template; Premium unlocks every
 * Premium (`signature`) template and every Pro template. A legacy per-template
 * row still counts.
 */
export async function hasTemplateAccess(
    supabase: SupabaseClient,
    userId: string,
    templateId: string,
    tier: string | null | undefined,
): Promise<boolean> {
    const rows = await liveEntitlements(supabase, userId, null);
    if (rows.some((row) => row.kind === "template" && row.template_id === templateId)) {
        return true;
    }
    if (rows.some((row) => row.kind === "premium")) return true;
    if (requiredPlanForTemplate(tier) === "pro" && rows.some((row) => row.kind === "pro")) {
        return true;
    }
    return false;
}

/**
 * Opening a paid generated look (`photos` / Pro or `motion` / Premium).
 * Starter (`casual`) is always free. Pro plan → Photo-rich; Premium → both paid looks.
 */
export async function hasStyleAccess(
    supabase: SupabaseClient,
    userId: string,
    styleId: string,
): Promise<boolean> {
    if (styleId === "casual") return true;
    const rows = await liveEntitlements(supabase, userId, null);
    if (rows.some((row) => row.kind === "style" && row.style_id === styleId)) return true;
    if (rows.some((row) => row.kind === "premium")) return true;
    if (styleId === "photos" && rows.some((row) => row.kind === "pro")) return true;
    return false;
}

export async function assertCanUsePaidDesign(
    supabase: SupabaseClient,
    userId: string,
    templateId: string,
    tier: string | null | undefined,
): Promise<void> {
    if (!requiredPlanForTemplate(tier)) return;
    if (await hasTemplateAccess(supabase, userId, templateId, tier)) return;
    throw new ApiError("payment_required", PAID_DESIGN_MESSAGE, `userId=${userId} templateId=${templateId}`);
}

export async function assertCanUseStyle(
    supabase: SupabaseClient,
    userId: string,
    styleId: string,
): Promise<void> {
    if (await hasStyleAccess(supabase, userId, styleId)) return;
    throw new ApiError("payment_required", PAID_DESIGN_MESSAGE, `userId=${userId} styleId=${styleId}`);
}

/**
 * The gate publish calls. Throws rather than returning false, so a caller cannot forget to
 * look at the answer — the failure mode of a boolean gate is publishing anyway.
 *
 * Going live on a PageCrafts address is free. When nothing is paid yet, a publish grant is
 * written here so the host step can proceed. Custom domain registration is paid separately,
 * later — not at this gate.
 */
export async function assertCanPublish(
    supabase: SupabaseClient,
    userId: string,
    projectId: string,
): Promise<EntitlementCheck> {
    const check = await checkEntitlement(supabase, userId, projectId, "publish");

    if (check.granted) return check;

    const row = {
        user_id: userId,
        project_id: projectId,
        kind: "publish" as const,
        source: "launch_offer" as const,
        status: "active",
    };
    const writer = supabaseAdminOrNull() ?? supabase;
    const { error } = await writer.from("entitlements").insert(row);

    if (error && error.code !== "23505") {
        throw new ApiError("internal", "Could not unlock publishing.", error.message);
    }

    return { kind: "publish", granted: true, source: "launch_offer", expiresAt: null };
}

/** Doc 22 P5: the first change within this long after going live is free. */
export const GOODWILL_WINDOW_DAYS = 7;
const GOODWILL_WINDOW_MS = GOODWILL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface EditPermission {
    allowed: boolean;
    /** Why it is allowed, for anything that wants to explain itself. */
    reason: "never_published" | "goodwill_window" | "unlocked" | "pro" | "locked";
}

/**
 * May this project still be edited? (R3 D13, Doc 22 P5)
 *
 * A site that has never gone live is simply a draft, and drafts are free to change. Once it
 * is published the rules change: editing it again needs an `edit_unlock` entitlement — with
 * the first change within seven days of publishing free, as a goodwill window.
 *
 * The window runs from the *first* successful publish, not the most recent. Measuring from
 * the latest one would renew itself on every republish, so anybody willing to press publish
 * again would never pay — which is not a goodwill window, it is a subscription nobody is
 * charged for.
 *
 * Decided here rather than in the editor, because a gate the client evaluates is a gate
 * (A-5). The panel may hide a button; this is what actually refuses the write.
 */
export async function checkEditPermission(
    supabase: SupabaseClient,
    userId: string,
    projectId: string,
): Promise<EditPermission> {
    const { data, error } = await supabase
        .from("deployments")
        .select("created_at, status")
        .eq("project_id", projectId)
        .eq("status", "live")
        .order("created_at", { ascending: true })
        .limit(1);

    if (error) throw new ApiError("internal", "Could not check the site's status.", error.message);

    const firstLive = (data ?? [])[0]?.created_at as string | undefined;
    if (!firstLive) return { allowed: true, reason: "never_published" };

    const since = Date.now() - Date.parse(firstLive);
    if (Number.isFinite(since) && since <= GOODWILL_WINDOW_MS) {
        return { allowed: true, reason: "goodwill_window" };
    }

    const unlock = await checkEntitlement(supabase, userId, projectId, "edit_unlock");
    if (unlock.granted) {
        return { allowed: true, reason: unlock.source === "pro" ? "pro" : "unlocked" };
    }

    return { allowed: false, reason: "locked" };
}

/**
 * The gate itself. Throws rather than returning false, for the same reason assertCanPublish
 * does: the failure mode of a boolean is a caller who forgets to look at it.
 */
export async function assertCanEdit(
    supabase: SupabaseClient,
    userId: string,
    projectId: string,
): Promise<EditPermission> {
    const permission = await checkEditPermission(supabase, userId, projectId);

    if (!permission.allowed) {
        throw new ApiError(
            "payment_required",
            `This site is live. Editing it again needs an unlock — changes in the first ${GOODWILL_WINDOW_DAYS} days after publishing are free.`,
            `projectId=${projectId}`,
        );
    }

    return permission;
}
