import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_NOTIFY_PREFS,
  type AccountExport,
  type AccountResponse,
  type NotifyPrefs,
} from "@/lib/contracts";
import type { ProjectSummary } from "@/lib/contracts/projects";
import { ApiError } from "@/lib/errors/respond";
import { supabaseAdmin } from "./supabase-admin";

// The account page's data (M-account).
//
// All three operations go through the caller's own client wherever they can, so RLS is what
// decides whose account this is — `users_select_own` and `users_update_own` are both keyed
// on auth.uid(), and the grant is narrowed to the columns a person may change. There is no
// user id parameter here on purpose: a function that took one could be called with somebody
// else's.

const ACCOUNT_SELECT =
  "email, email_verified, training_opt_in, created_at, handle, phone, billing_line, billing_city, gstin, notify_prefs";
const ACCOUNT_SELECT_BILLING =
  "email, email_verified, training_opt_in, created_at, handle, phone, billing_line, billing_city, gstin";
const ACCOUNT_SELECT_CORE = "email, email_verified, training_opt_in, created_at, handle";

function missingColumn(message: string): boolean {
  return (
    /column .* does not exist/i.test(message) ||
    /could not find .* column/i.test(message)
  );
}

export async function getAccount(supabase: SupabaseClient): Promise<AccountResponse> {
  const full = await supabase.from("users").select(ACCOUNT_SELECT).maybeSingle();

  if (!full.error) {
    if (!full.data) throw new ApiError("not_found", "That account does not exist.");
    return mapAccount(full.data as Record<string, unknown>, true);
  }

  if (!missingColumn(full.error.message)) {
    throw new ApiError("internal", "Could not read your account.", full.error.message);
  }

  const billing = await supabase.from("users").select(ACCOUNT_SELECT_BILLING).maybeSingle();

  if (!billing.error) {
    if (!billing.data) throw new ApiError("not_found", "That account does not exist.");
    return mapAccount(billing.data as Record<string, unknown>, true);
  }

  if (!missingColumn(billing.error.message)) {
    throw new ApiError("internal", "Could not read your account.", billing.error.message);
  }

  const core = await supabase.from("users").select(ACCOUNT_SELECT_CORE).maybeSingle();
  if (core.error) throw new ApiError("internal", "Could not read your account.", core.error.message);
  if (!core.data) throw new ApiError("not_found", "That account does not exist.");
  return mapAccount(core.data as Record<string, unknown>, false);
}

function parseNotifyPrefs(raw: unknown): NotifyPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_NOTIFY_PREFS };
  const value = raw as Record<string, unknown>;
  return {
    email: typeof value.email === "boolean" ? value.email : DEFAULT_NOTIFY_PREFS.email,
    published: typeof value.published === "boolean" ? value.published : DEFAULT_NOTIFY_PREFS.published,
    updated: typeof value.updated === "boolean" ? value.updated : DEFAULT_NOTIFY_PREFS.updated,
    payments: typeof value.payments === "boolean" ? value.payments : DEFAULT_NOTIFY_PREFS.payments,
    product: typeof value.product === "boolean" ? value.product : DEFAULT_NOTIFY_PREFS.product,
  };
}

function mapAccount(data: Record<string, unknown>, billingReady: boolean): AccountResponse {
  return {
    email: String(data.email ?? ""),
    emailVerified: Boolean(data.email_verified),
    trainingOptIn: Boolean(data.training_opt_in),
    createdAt: String(data.created_at ?? ""),
    displayName: typeof data.handle === "string" ? data.handle : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    billingLine: typeof data.billing_line === "string" ? data.billing_line : "",
    billingCity: typeof data.billing_city === "string" ? data.billing_city : "",
    gstin: typeof data.gstin === "string" ? data.gstin : "",
    billingReady,
    notifyPrefs: parseNotifyPrefs(data.notify_prefs),
  };
}

/**
 * Turn training-data consent on or off.
 *
 * Off by default and never inferred: the plan's rule is that consent cannot be retrofitted,
 * which means the only thing that may set this true is the person, on this page, on purpose.
 * The grant is `update (handle, avatar_url, training_opt_in)`, so this statement is the most
 * the database would allow a signed-in client to do even if it asked for more.
 */
export async function setTrainingConsent(
  supabase: SupabaseClient,
  trainingOptIn: boolean,
): Promise<AccountResponse> {
  // The filter is deliberate even though it excludes nothing. PostgREST can be configured to
  // refuse an UPDATE that carries no filter at all, and a statement whose safety depends on a
  // server setting is not a statement worth writing. RLS is still what decides which row this
  // reaches; this only makes the request well-formed on its own terms.
  const { error } = await supabase
    .from("users")
    .update({ training_opt_in: trainingOptIn })
    .not("id", "is", null);

  if (error) {
    throw new ApiError("internal", "Could not save that preference.", error.message);
  }

  return getAccount(supabase);
}

export async function setBillingProfile(
  supabase: SupabaseClient,
  profile: {
    displayName: string;
    phone: string;
    billingLine: string;
    billingCity: string;
    gstin: string;
  },
): Promise<AccountResponse> {
  const { error } = await supabase
    .from("users")
    .update({
      handle: profile.displayName || null,
      phone: profile.phone || null,
      billing_line: profile.billingLine || null,
      billing_city: profile.billingCity || null,
      gstin: profile.gstin || null,
    })
    .not("id", "is", null);

  if (error) {
    throw new ApiError("internal", "Could not save those details.", error.message);
  }

  return getAccount(supabase);
}

export async function setNotifyPrefs(
  supabase: SupabaseClient,
  notifyPrefs: NotifyPrefs,
): Promise<AccountResponse> {
  const { error } = await supabase
    .from("users")
    .update({ notify_prefs: notifyPrefs })
    .not("id", "is", null);

  if (error) {
    if (missingColumn(error.message)) {
      throw new ApiError(
        "internal",
        "Email notice preferences are not stored on this account yet.",
        error.message,
      );
    }
    throw new ApiError("internal", "Could not save those notices.", error.message);
  }

  return getAccount(supabase);
}

export function toAccountExport(
  account: AccountResponse,
  sites: ProjectSummary[],
  exportedAt = new Date().toISOString(),
): AccountExport {
  return {
    exportedAt,
    account: {
      email: account.email,
      emailVerified: account.emailVerified,
      createdAt: account.createdAt,
      displayName: account.displayName,
      trainingOptIn: account.trainingOptIn,
      notifyPrefs: account.notifyPrefs,
      phone: account.phone,
      billingLine: account.billingLine,
      billingCity: account.billingCity,
      gstin: account.gstin,
    },
    sites: sites.map((site) => ({
      id: site.id,
      name: site.name,
      status: site.status,
      liveUrl: site.liveUrl,
    })),
  };
}

/**
 * Delete the account and everything it owns.
 *
 * Needs the service role, and only for this: removing a row from auth.users is not something
 * a signed-in client can be allowed to do, and everything else follows from it — public.users
 * references auth.users on delete cascade, and projects, files, commits, deployments and
 * assets cascade from there. Generations keep their cost rows with a null user, which is
 * accounting history rather than personal data (ASM-10).
 *
 * What this does not touch is a published site. It is the person's, on hosting they were
 * given, and deleting an account is not a request to take their website off the internet
 * (C-12). That is a separate decision and deserves to be asked separately.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);

  if (error) {
    throw new ApiError("internal", "Could not delete your account.", error.message);
  }
}
