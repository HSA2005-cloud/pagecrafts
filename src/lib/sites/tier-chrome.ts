/**
 * Visual chrome by product tier.
 *
 * Catalogue: free → Starter, premium → Pro, signature → Premium.
 * AI looks: casual → Starter, photos → Pro, motion → Premium (ids stay stable for entitlements).
 */
import type { TemplateTier } from "@/lib/contracts";

export type ChromeKind = "sidebar" | "topbar" | "liquid";

export function chromeForTemplateTier(tier: TemplateTier): ChromeKind {
    if (tier === "signature") return "liquid";
    if (tier === "premium") return "topbar";
    return "sidebar";
}

export function chromeForStyleId(styleId: string | undefined): ChromeKind {
    if (styleId === "motion") return "liquid";
    if (styleId === "photos") return "topbar";
    return "sidebar";
}

export const TIER_PRODUCT_LABEL: Record<TemplateTier, string> = {
    free: "Starter",
    premium: "Pro",
    signature: "Premium",
};
