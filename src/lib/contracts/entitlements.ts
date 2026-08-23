// What a user has paid for or been granted. Publishing is gated on these (A-5, Doc 22 §6),
// never on connecting an external account (A1). Entitlement state is server-side, so a
// paid publish never re-charges on retry.
//
// - publish     : per-project — the site may go live (free launch offer, paid Rs 249, or Pro)
// - edit_unlock : per-project — reopen editing on a published site (Doc 22 P5); the first
//                 change within 7 days of publishing is free (goodwill window)
// - pro         : per-user    — Pro subscription (premium-tier designs, unlimited AI, etc.)
// - premium     : per-user    — Premium subscription (everything Pro has, plus signature-tier
//                 designs). The highest plan.
export type EntitlementKind = "publish" | "edit_unlock" | "pro" | "premium";
export type EntitlementSource = "launch_offer" | "paid" | "pro" | "premium";
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
