import { asksTableOrdering } from '@/lib/ai/composition/requested-pages';

/**
 * Cheap, pre-LLM estimate of how expensive a generation will be.
 * Standard → recipe pipeline (section JSON → templates).
 * Heavy → custom multi-file compose (any site shape the model can emit).
 */

export type BuildMode = 'recipe' | 'custom';
export type TokenBand = 'standard' | 'heavy';

export interface BuildEstimate {
    mode: BuildMode;
    band: TokenBand;
    /** Rough total tokens across the job (in + out), for messaging. */
    estimatedTokens: number;
    reasons: string[];
}

/** Interactive / app-like asks that the section recipe cannot express. */
const CUSTOM_FEATURE =
    /\b(cart|checkout|waiter|kitchen\s+ticket|table\s*number|dashboard|admin(\s+panel)?|login|sign[- ]?in|sign[- ]?up\s+flow|auth(entication)?|booking\s+system|reservation\s+system|crm|kanban|calendar\s+app|todo\s+app|chat(\s+ui)?|real[- ]?time|websocket|localStorage|indexeddb|spa\b|single[- ]page\s+app|web\s+app|progressive\s+web|pwa|multi[- ]?step\s+form|wizard|drag[- ]?and[- ]?drop|file\s+upload|payment\s+gateway|stripe|paypal|inventory|pos\b|point\s+of\s+sale)\b/i;

/** Explicit “build this kind of product” beyond a marketing site. */
const CUSTOM_PRODUCT =
    /\b(build (me |us )?(an? |the )?(app|tool|portal|platform|system|calculator|quiz|configurator)|not (just )?a (landing|marketing) (page|site)|full[- ]?stack|interactive (site|page|experience))\b/i;

/** Named custom pages / flows the recipe list does not cover. */
const CUSTOM_PAGE =
    /\b((waiter|orders?|cart|checkout|dashboard|admin|login|portal|account|billing|settings)\s+page|page\s+that\s+(lets|allows|has|shows|tracks|sends))\b/i;

const DETAILED_SPEC =
    /\b(must |should |need(s)? to |require[sd]? |include[sd]? |with the following|step[- ]by[- ]step)\b/i;

/** Heuristic token cost for a full recipe job (classify+profile+plan+fills). */
const STANDARD_TOKENS = 9_000;
/** Heuristic for a custom compose job (classify + one large compose call). */
const HEAVY_TOKENS = 28_000;

export function estimateSiteBuild(prompt: string): BuildEstimate {
    const text = prompt.trim();
    const reasons: string[] = [];

    if (asksTableOrdering(text) || CUSTOM_FEATURE.test(text)) {
        reasons.push('interactive or app-like features');
    }
    if (CUSTOM_PRODUCT.test(text)) {
        reasons.push('asked for an app/tool beyond a marketing site');
    }
    if (CUSTOM_PAGE.test(text)) {
        reasons.push('named a custom page or flow');
    }
    if (text.length >= 320 && DETAILED_SPEC.test(text)) {
        reasons.push('long, detailed specification');
    }

    if (reasons.length === 0) {
        return {
            mode: 'recipe',
            band: 'standard',
            estimatedTokens: STANDARD_TOKENS,
            reasons: ['generic marketing site — section recipe'],
        };
    }

    return {
        mode: 'custom',
        band: 'heavy',
        estimatedTokens: HEAVY_TOKENS,
        reasons,
    };
}

export function isHeavyBuild(estimate: BuildEstimate): boolean {
    return estimate.band === 'heavy';
}
