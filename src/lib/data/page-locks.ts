import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/errors/respond";
import { accountPlan } from "./entitlements";
import { getProject, patchProject } from "./projects";

/**
 * Pages the person has confirmed in the walkthrough, and what that means on each plan.
 *
 * The walkthrough steps through a generated site one page at a time: change what you want,
 * press Confirm, move on. On Starter, confirming is final — that page cannot be written
 * again without upgrading. Pro and Premium may go back.
 *
 * The rule lives on the server because a lock enforced in the browser is not a lock. The
 * editor, Ask, and any script pointed at the API all reach the same write paths, and all of
 * them have to hear the same answer.
 *
 * State goes in projects.site_meta rather than its own table: it is a short list of strings
 * that belongs to the project, patchProject already merges site_meta, and a migration is a
 * cost worth avoiding for a list of file names.
 */

const KEY = "confirmedPages";

export const PAGE_LOCKED_MESSAGE =
    "You confirmed this page on the free plan, so it is finished. Upgrade to Pro to open it again.";

export function confirmedPages(siteMeta: unknown): string[] {
    if (!siteMeta || typeof siteMeta !== "object") return [];

    const raw = (siteMeta as Record<string, unknown>)[KEY];
    if (!Array.isArray(raw)) return [];

    return [...new Set(raw.filter((path): path is string => typeof path === "string"))];
}

/** Starter confirms for good; a paid plan can revisit. */
export function planLocksConfirmedPages(plan: string): boolean {
    return plan !== "pro" && plan !== "premium";
}

export async function lockedPagesFor(
    supabase: SupabaseClient,
    userId: string,
    projectId: string,
): Promise<string[]> {
    const [project, plan] = await Promise.all([
        getProject(supabase, projectId),
        accountPlan(supabase, userId),
    ]);

    if (!planLocksConfirmedPages(plan)) return [];

    return confirmedPages(project.siteMeta);
}

/**
 * Record a page as confirmed.
 *
 * Idempotent: confirming twice is the same as once, which matters because the walkthrough
 * can be reloaded mid-way and because a double-tap must not be an error.
 */
export async function confirmPage(
    supabase: SupabaseClient,
    projectId: string,
    path: string,
): Promise<string[]> {
    const project = await getProject(supabase, projectId);
    const already = confirmedPages(project.siteMeta);

    if (already.includes(path)) return already;

    const next = [...already, path];
    await patchProject(supabase, projectId, { siteMeta: { [KEY]: next } });

    return next;
}

/**
 * Refuse a write that would change a page this person has finished with.
 *
 * `touching` is the set of paths a write would alter — not every path it sends. The editor
 * saves the whole tree on every keystroke-flush, so comparing what was sent against what is
 * stored is the only way to tell an edit from a no-op, and locking on "sent" would freeze
 * the entire site the moment one page was confirmed.
 */
export async function assertPagesEditable(
    supabase: SupabaseClient,
    userId: string,
    projectId: string,
    touching: readonly string[],
): Promise<void> {
    if (touching.length === 0) return;

    const locked = await lockedPagesFor(supabase, userId, projectId);
    if (locked.length === 0) return;

    const blocked = touching.filter((path) => locked.includes(path));
    if (blocked.length === 0) return;

    throw new ApiError(
        "payment_required",
        PAGE_LOCKED_MESSAGE,
        `projectId=${projectId} pages=${blocked.join(",")}`,
    );
}
