import type { EntitlementKind, EntitlementSource, EntitlementStatus } from "./entitlements";

// The account, as its owner sees it (M-account: GET /account · PATCH /account/consent ·
// PATCH /account/notifications · GET /account/billing · GET /account/export · DELETE /account).
//
// Deliberately small. Nothing here identifies anyone but the person asking, and nothing a
// client could set that the server would trust — the email is decided at sign-up and the
// verified flag by the mail we sent, so both are read-only facts rather than fields.

export interface NotifyPrefs {
  email: boolean;
  published: boolean;
  updated: boolean;
  payments: boolean;
  security: boolean;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  email: true,
  published: true,
  updated: true,
  payments: true,
  security: true,
};

export interface AccountResponse {
  email: string;
  emailVerified: boolean;
  /** Off by default, and consent cannot be retrofitted — see PATCH /account/consent. */
  trainingOptIn: boolean;
  createdAt: string;
  displayName: string;
  phone: string;
  billingLine: string;
  billingCity: string;
  billingState: string;
  billingPostal: string;
  billingCountry: string;
  gstin: string;
  /** False when the billing columns are not on `users` yet. Never invents a card or bank number. */
  billingReady: boolean;
  notifyPrefs: NotifyPrefs;
}

export interface ConsentRequest {
  trainingOptIn: boolean;
}

export interface NotifyPrefsRequest {
  notifyPrefs: NotifyPrefs;
}

export interface DeleteAccountResponse {
  deleted: true;
}

export type AccountPlan = "starter" | "pro" | "premium";

export const ACCOUNT_PLAN_LABEL: Record<AccountPlan, string> = {
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};

/** Starter and Pro can still move up. Premium is the top unlock, so Upgrade stays hidden. */
export function canUpgradePlan(plan: AccountPlan): boolean {
  return plan === "starter" || plan === "pro";
}

export interface BillingHistoryItem {
  id: string;
  kind: EntitlementKind;
  source: EntitlementSource;
  status: EntitlementStatus;
  grantedAt: string;
  projectId: string | null;
}

export interface BillingSummary {
  plan: AccountPlan;
  /** False when this server has no Razorpay keys. Checkout will say so if they try. */
  paymentsReady: boolean;
  proPriceInr: number;
  premiumPriceInr: number;
  /** AI usage package — Free or Advanced (not catalogue Starter/Pro/Premium). */
  aiPackage: "free" | "advanced";
  advancedPriceInr: number;
  generationPassPriceInr: number;
  /** Extra AI rounds bought after the package allowance. */
  generationPasses: number;
  /** Catalogue designs this account has unlocked (legacy plans expand to every matching tier). */
  unlockedTemplateIds: string[];
  /** Generated looks this account has unlocked (`photos`, `motion`). */
  unlockedStyleIds: string[];
  history: BillingHistoryItem[];
}

export const DEFAULT_BILLING: BillingSummary = {
  plan: "starter",
  paymentsReady: false,
  proPriceInr: 499,
  premiumPriceInr: 999,
  aiPackage: "free",
  advancedPriceInr: 699,
  generationPassPriceInr: 199,
  generationPasses: 0,
  unlockedTemplateIds: [],
  unlockedStyleIds: [],
  history: [],
};

export interface AccountExport {
  exportedAt: string;
  account: {
    email: string;
    emailVerified: boolean;
    createdAt: string;
    displayName: string;
    trainingOptIn: boolean;
    notifyPrefs: NotifyPrefs;
    phone: string;
    billingLine: string;
    billingCity: string;
    billingState: string;
    billingPostal: string;
    billingCountry: string;
    gstin: string;
  };
  sites: { id: string; name: string; status: string; liveUrl: string | null }[];
}
