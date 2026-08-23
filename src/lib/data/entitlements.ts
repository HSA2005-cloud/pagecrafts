import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    EntitlementCheck,
    EntitlementKind,
    EntitlementSource,
    Plan,
    TemplateTier,
} from "@/lib/contracts";
import { planAllowsTier } from "@/lib/contracts";
import { ApiError } from "@/lib/errors/respond";

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
            // A project-scoped grant only counts for its own project; a subscription (pro or
            // premium) is user-level and counts always.
            return r.kind === "pro" || r.kind === "premium" || r.project_id === projectId;
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

    // Any subscription (Pro or Premium) satisfies publish and edit_unlock — a plan that did
    // not cover going live would be a plan nobody could describe.
    const sub = rows.find((row) => row.kind === "pro" || row.kind === "premium");
    if (sub) {
        return { kind, granted: true, source: sub.source, expiresAt: sub.expires_at };
    }

    return { kind, granted: false };
}

/** True when the account holds any live paid subscription (Pro or Premium). */
export async function hasPro(supabase: SupabaseClient, userId: string): Promise<boolean> {
    return (await resolvePlan(supabase, userId)) !== "starter";
}

/**
 * The account's current plan, resolved from the database (A-5).
 *
 * Premium outranks Pro; a lapsed or revoked row is not counted (isLive). This is the single
 * server-side answer to "what may this user do" — never taken from the client, so flipping a
 * value in the browser cannot buy an upgrade.
 */
export async function resolvePlan(supabase: SupabaseClient, userId: string): Promise<Plan> {
    const rows = await liveEntitlements(supabase, userId, null);
    if (rows.some((row) => row.kind === "premium")) return "premium";
    if (rows.some((row) => row.kind === "pro")) return "pro";
    return "starter";
}

/** The pricing tier of a project's source design, read from the row (never the request). */
export async function projectTier(
    supabase: SupabaseClient,
    projectId: string,
): Promise<TemplateTier> {
    const { data: project, error } = await supabase
        .from("projects")
        .select("source_template_id")
        .eq("id", projectId)
        .maybeSingle();

    if (error) throw new ApiError("internal", "Could not read the project.", error.message);
    if (!project) throw new ApiError("not_found", "That project does not exist.");

    const templateId = (project as { source_template_id: string | null }).source_template_id;
    if (!templateId) return "free";

    const { data: template, error: templateError } = await supabase
        .from("templates")
        .select("tier")
        .eq("id", templateId)
        .maybeSingle();

    if (templateError) {
        throw new ApiError("internal", "Could not read the design.", templateError.message);
    }

    return ((template as { tier: TemplateTier } | null)?.tier ?? "free") as TemplateTier;
}

/**
 * The gate publish calls. Throws rather than returning false, so a caller cannot forget to
 * look at the answer — the failure mode of a boolean gate is publishing anyway.
 *
 * The rule follows the design's tier, not a blanket fee (E-1 §publish):
 *   - a free design goes live for free, on any plan (including Starter);
 *   - a paid design (premium/signature) needs a plan that covers its tier, or a per-project
 *     `publish`/subscription grant for that specific site.
 * The tier is read from the database, so no request payload can turn a paid design free.
 */
export async function assertCanPublish(
    supabase: SupabaseClient,
    userId: string,
    projectId: string,
): Promise<EntitlementCheck> {
    const tier = await projectTier(supabase, projectId);
    const plan = await resolvePlan(supabase, userId);

    // Plan covers the design's tier — free designs are covered for everyone.
    if (planAllowsTier(plan, tier)) {
        const source: EntitlementSource =
            plan === "premium" ? "premium" : plan === "pro" ? "pro" : "launch_offer";
        return { kind: "publish", granted: true, source };
    }

    // Otherwise a per-project purchase (or subscription) for this site still lets it publish.
    const check = await checkEntitlement(supabase, userId, projectId, "publish");
    if (check.granted) return check;

    throw new ApiError(
        "payment_required",
        "This design needs a higher plan before this site can go live.",
        `projectId=${projectId};tier=${tier}`,
    );
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
 * is published the rules change: editing it again needs an `edit_unlock` entitlement â€” with
 * the first change within seven days of publishing free, as a goodwill window.
 *
 * The window runs from the *first* successful publish, not the most recent. Measuring from
 * the latest one would renew itself on every republish, so anybody willing to press publish
 * again would never pay â€” which is not a goodwill window, it is a subscription nobody is
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
        const bySubscription = unlock.source === "pro" || unlock.source === "premium";
        return { allowed: true, reason: bySubscription ? "pro" : "unlocked" };
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
            `This site is live. Editing it again needs an unlock â€” changes in the first ${GOODWILL_WINDOW_DAYS} days after publishing are free.`,
            `projectId=${projectId}`,
        );
    }

    return permission;
}
