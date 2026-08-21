/** AI usage packages — not the same as catalogue Starter / Pro / Premium designs. */

import {
    ADVANCED_GENERATIONS_PER_PROJECT,
    ADVANCED_PACKAGE_PRICE_INR,
    FREE_GENERATIONS_PER_PROJECT,
    GENERATION_PASS_PRICE_INR,
} from "@/lib/limits/config";

export type AiPackageId = "free" | "advanced";

export interface AiPackageInfo {
    id: AiPackageId;
    name: string;
    priceInr: number;
    generationsPerSite: number;
    blurb: string;
    features: string[];
}

export const AI_PACKAGES: Record<AiPackageId, AiPackageInfo> = {
    free: {
        id: "free",
        name: "Free",
        priceInr: 0,
        generationsPerSite: FREE_GENERATIONS_PER_PROJECT,
        blurb: "Try AI on a site — three rounds of standard generation, each with three looks.",
        features: [
            `${FREE_GENERATIONS_PER_PROJECT} standard AI generations per site`,
            "Each generation offers Casual, Photo-rich, and Animated looks",
            "Custom / interactive builds (carts, apps, dashboards) need Advanced or a pass",
            "Buy individual designs separately when you want them",
        ],
    },
    advanced: {
        id: "advanced",
        name: "Advanced",
        priceInr: ADVANCED_PACKAGE_PRICE_INR,
        generationsPerSite: ADVANCED_GENERATIONS_PER_PROJECT,
        blurb: "Ten times the Free AI allowance — including custom builds that cost more tokens.",
        features: [
            `${ADVANCED_GENERATIONS_PER_PROJECT} AI generations per site`,
            "Standard marketing sites and custom interactive sites",
            "Same three looks each round (Casual, Photo-rich, Animated)",
            "After that, buy a one-round pass if you still want more",
        ],
    },
};

export const GENERATION_PASS = {
    name: "Extra generation",
    priceInr: GENERATION_PASS_PRICE_INR,
    blurb: "One more AI round — including a custom / heavy build if you need one. Three looks again.",
} as const;

export function generationsLimitForPackage(pkg: AiPackageId): number {
    return pkg === "advanced"
        ? ADVANCED_GENERATIONS_PER_PROJECT
        : FREE_GENERATIONS_PER_PROJECT;
}
