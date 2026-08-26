import { publicEnv } from "@/lib/config/env";
import { safeNext } from "@/lib/auth/safe-next";

/**
 * Where an emailed link should land after the token is traded for a session.
 *
 * No query string on purpose. Hosted Auth allow-lists match the path; putting `?next=`
 * on emailRedirectTo makes a TokenHash template (`{{ .RedirectTo }}?token_hash=…`)
 * produce a broken URL, and an exact allow-list entry miss the redirect.
 */
export function authConfirmUrl(): string {
  const base = publicEnv.appUrl.replace(/\/+$/, "");
  return `${base}/api/v1/auth/confirm`;
}

export function confirmDestination(
  type: string | null | undefined,
  nextParam: string | null | undefined,
): string {
  if (nextParam != null && nextParam !== "") return safeNext(nextParam);
  if (type === "recovery") return "/reset";
  // After email confirmation, land on signed-in home — not the guest landing or /new.
  return "/";
}
