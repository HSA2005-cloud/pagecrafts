import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntitlementCheck, EntitlementKind, EntitlementSource } from "@/lib/contracts";
import { ApiError } from "@/lib/errors/respond";
import { getStoredPlan } from "@/lib/data/plan";
import { planGrantsPro } from "@/lib/plans/catalog";

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
        .select("kind, source, status, expires_at, project_id")
        .eq("user_id", userId);
    if (error) throw new ApiError("internal", "Could not check your account.", error.message);

    const now = new Date();
    return (data ?? [])
        .filter((row) => {
            const r = row as unknown as EntitlementRow & { project_id: string | null };
            if (!isLive(r, now)) return false;
            // A project-scoped grant only counts for its own project; `pro` counts always.
            return r.kind === "pro" || r.project_id === projectId;
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

    const pro = rows.find((row) => row.kind === "pro");
    if (pro) return { kind, granted: true, source: "pro", expiresAt: pro.expires_at };

    // A Pro or Premium account plan carries the same weight as a `pro` entitlement: it
    // satisfies publish, edit_unlock and pro alike (R-plans). The plan is the account-level
    // unlock; the entitlement rows remain for per-project grants (a single paid publish) and
    // for the launch offer, and either path answers "yes" here.
    const plan = await getStoredPlan(supabase);
    if (planGrantsPro(plan)) return { kind, granted: true, source: "pro" };

    return { kind, granted: false };
}

/** True when the account holds a live `pro` subscription. */
export async function hasPro(supabase: SupabaseClient, userId: string): Promise<boolean> {
    return (await checkEntitlement(supabase, userId, null, "pro")).granted;
}

/**
 * The gate publish calls. Throws rather than returning false, so a caller cannot forget to
 * look at the answer — the failure mode of a boolean gate is publishing anyway.
 */
export async function assertCanPublish(
    supabase: SupabaseClient,
    userId: string,
    projectId: string,
): Promise<EntitlementCheck> {
    const check = await checkEntitlement(supabase, userId, projectId, "publish");

    if (!check.granted) {
        throw new ApiError(
            "payment_required",
            "This site needs to be paid for before it can go live.",
            `projectId=${projectId}`,
        );
    }

    return check;
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
