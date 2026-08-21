// What a user has paid for or been granted. Publishing is gated on these (A-5, Doc 22 §6),
// never on connecting an external account (A1). Entitlement state is server-side, so a
// paid publish never re-charges on retry.
//
// - publish     : per-project — the site may go live (launch offer, paid publish, or a legacy plan)
// - edit_unlock : per-project — reopen editing on a published site (Doc 22 P5); the first
//                 change within 7 days of publishing is free (goodwill window)
// - template    : per-user    — one catalogue design, bought at the price on its tile
// - style       : per-user    — one generated look (`photos` or `motion`)
// - advanced    : per-user    — AI usage package (Rs 699); raises generation limit per site
// - pro         : per-user    — legacy account plan (Rs 499); still honoured if already granted
// - premium     : per-user    — legacy account plan (Rs 999); still honoured if already granted
export type EntitlementKind =
  | "publish"
  | "edit_unlock"
  | "template"
  | "style"
  | "pro"
  | "premium"
  | "advanced";
export type EntitlementSource = "launch_offer" | "paid" | "pro";
export type EntitlementStatus = "active" | "expired" | "revoked";

export interface Entitlement {
  id: string;
  userId: string;
  projectId: string | null; // null for user-level entitlements (pro)
  kind: EntitlementKind;
  source: EntitlementSource;
  status: EntitlementStatus;
  grantedAt: string;
  expiresAt: string | null;
}

// Result of the server-side check the publish + post-publish-edit paths call.
export interface EntitlementCheck {
  kind: EntitlementKind;
  granted: boolean;
  source?: EntitlementSource;
  expiresAt?: string | null;
}
