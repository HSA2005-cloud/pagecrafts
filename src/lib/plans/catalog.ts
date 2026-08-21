import type { TemplateTier } from "@/lib/contracts";

// The single source of truth for plans (Rs 499 Pro, Rs 999 Premium — one-time, A1/Doc 22).
//
// Everything about a plan lives here: its id, name, price, what it unlocks, and the words
// the /plans cards show. Prices are read from this file on the server when an order is
// created and never taken from the request, so the browser cannot name its own price. The
// same module is imported by the client cards, which is what keeps the figure a person is
// shown and the figure they are charged the same figure.
//
// This module is pure (no server-only, no imports that touch the network), so it is safe on
// both sides of the wire.

export type PlanId = "starter" | "pro" | "premium";

/** Cheapest first. Also the rank order: a plan unlocks everything at or below it. */
export const PLAN_IDS = ["starter", "pro", "premium"] as const satisfies readonly PlanId[];

export interface PlanDef {
    id: PlanId;
    name: string;
    /** Rupees. 0 for starter — nothing to pay, nothing to checkout. */
    priceInr: number;
    /** "Free" or "Rs 499". Derived once here so a card never spells a price of its own. */
    priceLabel: string;
    /** The one-liner under the price. */
    tagline: string;
    description: string;
    /** The gold "POPULAR" ribbon in the reference sits on Pro. */
    popular: boolean;
    features: string[];
    /** The highest template tier this plan can fork. */
    unlocksTier: TemplateTier;
}

export const PLAN_CATALOG: Record<PlanId, PlanDef> = {
    starter: {
        id: "starter",
        name: "Starter",
        priceInr: 0,
        priceLabel: "Free",
        tagline: "The default plan",
        description:
            "The default plan. Build and edit websites with AI and use free templates. " +
            "A free design goes live at no charge; a paid design is billed when you publish " +
            "that site.",
        popular: false,
        features: [
            "Build and edit sites with AI",
            "Use every free template",
            "Publish free designs at no charge",
            "Pay per paid design when that site goes live",
        ],
        unlocksTier: "free",
    },
    pro: {
        id: "pro",
        name: "Pro",
        priceInr: 499,
        priceLabel: "Rs 499",
        tagline: "once",
        description:
            "One payment through Razorpay. Unlock the Pro template collection, publish any " +
            "design without a separate publish checkout, keep editing after a site is live, " +
            "and drop the per-site AI cap. Not a subscription — it stays until you change plan.",
        popular: true,
        features: [
            "Everything in Starter",
            "Unlock all Pro templates",
            "Publish any design without a per-site checkout",
            "Unlimited AI generations",
            "Edit live sites after the free window",
        ],
        unlocksTier: "premium",
    },
    premium: {
        id: "premium",
        name: "Premium",
        priceInr: 999,
        priceLabel: "Rs 999",
        tagline: "once",
        description:
            "Everything in Pro, plus the Premium template collection — the top account " +
            "unlock for people who publish often or keep several sites. One payment, no " +
            "auto-renew, same Razorpay checkout.",
        popular: false,
        features: [
            "Everything in Pro",
            "Unlock all Premium templates",
            "The top one-time account unlock",
            "Stays until you change plan",
        ],
        unlocksTier: "signature",
    },
};

/** The plans in display order (Starter, Pro, Premium). */
export const PLANS: PlanDef[] = PLAN_IDS.map((id) => PLAN_CATALOG[id]);

const PLAN_RANK: Record<PlanId, number> = { starter: 0, pro: 1, premium: 2 };

/** A design's tier maps to the cheapest plan that can fork it. */
const TIER_REQUIRED_PLAN: Record<TemplateTier, PlanId> = {
    free: "starter",
    premium: "pro",
    signature: "premium",
};

export function planRank(plan: PlanId): number {
    return PLAN_RANK[plan] ?? 0;
}

/** The plan a person must hold to use a design of this tier. */
export function requiredPlanForTier(tier: TemplateTier): PlanId {
    return TIER_REQUIRED_PLAN[tier] ?? "starter";
}

/** May this plan fork a design of this tier? Starter → free only; Premium → everything. */
export function canAccessTier(plan: PlanId, tier: TemplateTier): boolean {
    return planRank(plan) >= planRank(requiredPlanForTier(tier));
}

/** The higher of two plans. Used so an upgrade never quietly moves someone down. */
export function maxPlan(a: PlanId, b: PlanId): PlanId {
    return planRank(a) >= planRank(b) ? a : b;
}

/** True when the plan carries Pro-or-better privileges (publish, unlimited AI, edits). */
export function planGrantsPro(plan: PlanId): boolean {
    return planRank(plan) >= planRank("pro");
}

/** A safe cast for a value that should be a PlanId but arrived from the database or a form. */
export function toPlanId(value: unknown): PlanId {
    return value === "pro" || value === "premium" ? value : "starter";
}

/** The plan name to show on a lock badge for a design of this tier ("Pro" / "Premium"). */
export function lockLabelForTier(tier: TemplateTier): string {
    return PLAN_CATALOG[requiredPlanForTier(tier)].name;
}
