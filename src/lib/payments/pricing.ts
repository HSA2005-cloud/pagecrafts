import type { TemplateTier } from "@/lib/contracts";

// What publishing a site costs (Doc 22 P1-P3, Amendment A1).
//
// One place, because a price that appears twice eventually disagrees with itself, and the
// half a person is shown is not always the half they are charged.
//
// It appears twice today: TIER_LABELS in lib/discovery/filters.ts spells out "Rs 499" and
// "Rs 999" for the tiles. That file belongs to discovery, so this does not reach into it —
// but deriving those labels from here is the right follow-up, and until it happens a price
// change has to be made in two files by someone who remembers both.
//
// The price follows the design, not the project: a free design publishes free, and a
// premium one is paid for once, at publish. That is the gate the plan describes — everything
// before publish is free, and the price is stated plainly at the one moment it applies.

export const TIER_PRICE_INR: Record<TemplateTier, number> = {
    free: 0,
    premium: 499,
    signature: 999,
};

/** Account Pro and Premium — one payment each, until they switch back to Starter. */
export const PRO_PRICE_INR = TIER_PRICE_INR.premium;
export const PREMIUM_PRICE_INR = TIER_PRICE_INR.signature;

/**
 * Rupees as Razorpay wants them.
 *
 * Razorpay counts in paise, and the classic payments bug is being out by a hundred in
 * either direction. It happens once, here, so nothing downstream has to remember.
 */
export function inrToPaise(rupees: number): number {
    return Math.round(rupees * 100);
}

/** What this design costs to publish, in rupees. */
export function publishPriceInr(tier: TemplateTier): number {
    return TIER_PRICE_INR[tier] ?? TIER_PRICE_INR.free;
}

/** A free design needs no order, no checkout and no webhook — just the grant. */
export function isFree(tier: TemplateTier): boolean {
    return publishPriceInr(tier) === 0;
}

/**
 * Whether opening this design or look needs a payment.
 *
 * Catalogue tiers are `free` | `premium` | `signature`. Generated looks add `pro`.
 * Anything else — missing, unknown, or `free` — stays free to open.
 */
export function isPaidTier(tier: string | null | undefined): boolean {
    return requiredPlanForTemplate(tier) !== null || requiredPlanForStyle(tier) !== null;
}

export type PaidPlan = "pro" | "premium";

export type PaidBadge = "Pro" | "Premium";

/** Catalogue `premium` is the Pro tile (Rs 499); `signature` is Premium (Rs 999). */
export function requiredPlanForTemplate(tier: string | null | undefined): PaidPlan | null {
    if (tier === "premium") return "pro";
    if (tier === "signature") return "premium";
    return null;
}

/** Generated looks: photos is Pro; motion is Premium. */
export function requiredPlanForStyle(tier: string | null | undefined): PaidPlan | null {
    if (tier === "pro") return "pro";
    if (tier === "premium") return "premium";
    return null;
}

/** Plan badge before unlock — Pro or Premium on the tile. */
export function templateBadge(tier: string | null | undefined): PaidBadge | null {
    if (tier === "premium") return "Pro";
    if (tier === "signature") return "Premium";
    return null;
}

/** Plan badge before unlock — Pro or Premium on a generated look. */
export function styleBadge(tier: string | null | undefined): PaidBadge | null {
    if (tier === "pro") return "Pro";
    if (tier === "premium") return "Premium";
    return null;
}

/** Word on the tile once account access is known — covered designs read "Free". */
export function templateTileLabel(
    tier: string | null | undefined,
    options?: { unlocked?: boolean },
): string {
    if (tier === "free" || options?.unlocked) return "Free";
    return templateBadge(tier) ?? `Rs ${templatePriceInr(tier)}`;
}

/** Word on a look tile once account access is known. */
export function styleTileLabel(
    tier: string | null | undefined,
    options?: { unlocked?: boolean },
): string {
    if (!tier || tier === "free") return "Free";
    if (options?.unlocked) {
        if (tier === "pro") return "Pro unlocked";
        if (tier === "premium") return "Premium unlocked";
        return "Free";
    }
    return styleBadge(tier) ?? "Free";
}

export function templatePriceInr(tier: string | null | undefined): number {
    if (tier === "premium") return TIER_PRICE_INR.premium;
    if (tier === "signature") return TIER_PRICE_INR.signature;
    return 0;
}
