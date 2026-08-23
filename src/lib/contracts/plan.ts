import type { TemplateTier } from "./template";

// Subscription plans (E-1 §plans). Starter is the default and needs no row; Pro
// and Premium are user-level entitlements. Kept as pure data + functions with no
// server imports, so the plans page (client) and the API gates (server) decide
// access the same way.
export type Plan = "starter" | "pro" | "premium";

export const PLANS: readonly Plan[] = ["starter", "pro", "premium"] as const;

export const PLAN_RANK: Record<Plan, number> = { starter: 0, pro: 1, premium: 2 };

export const PLAN_LABEL: Record<Plan, string> = {
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};

// The lowest plan that may use a design of each tier. This is the single source of
// truth the fork gate, the publish gate and the plans page all read.
export const TIER_MIN_PLAN: Record<TemplateTier, Plan> = {
  free: "starter",
  premium: "pro",
  signature: "premium",
};

/** Does `plan` cover a design of `tier`? */
export function planAllowsTier(plan: Plan, tier: TemplateTier): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[TIER_MIN_PLAN[tier]];
}

/** True for any paid subscription (Pro or Premium) — the "not Starter" question. */
export function isSubscriber(plan: Plan): boolean {
  return plan !== "starter";
}

// One-time upgrade price for each paid plan, in rupees. Mirrors the design-tier prices the
// plans unlock (Pro ↔ premium designs at Rs 499, Premium ↔ signature designs at Rs 999).
export type PaidPlan = Exclude<Plan, "starter">;
export const PLAN_PRICE_INR: Record<PaidPlan, number> = { pro: 499, premium: 999 };

