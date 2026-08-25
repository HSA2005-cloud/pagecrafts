import { isSiteGenerationRequest } from '@/lib/editor/site-intent';

/**
 * Blocks edit-chat requests that would replace an existing site with a different kind of
 * business — e.g. restaurant → gym. Pure heuristics, gated before the LLM on client and server.
 */

const SITE_REQUEST =
    /\b((create|build|make|generate|design|start|draft|rebuild|replace)\b[\s\S]{0,120}\b(website|web site|site|landing page|homepage|home page|web page|page)\b)|(\b(website|web site|landing page|homepage)\b[\s\S]{0,60}\b(for|about)\b)/i;

const NEW_SITE_BRIEF =
    /\b(create|build|make|generate|design|start|draft|replace|i want|i need)\b/i;

const SECTION_TWEAK =
    /\b(heading|headline|subhead|sub-?heading|button|label|this section|that section|this copy|the copy|colour|color|rewrite this|shorter|longer|teal|font|padding|margin)\b/i;

const CROSS_SITE =
    /\b(turn\s+(?:this|it|the\s+site)\s+into|instead\s+(?:make|build|create)|replace\s+(?:this|the\s+site)\s+with|switch\s+to\s+a?\s|make\s+this\s+a?\s)\b/i;

/** Broad business families — enough to catch a different site type, not every slug. */
const VERTICAL_FAMILIES: Record<string, readonly string[]> = {
    food: [
        'restaurant',
        'cafe',
        'café',
        'coffee shop',
        'bakery',
        'bistro',
        'diner',
        'dining',
        'kitchen',
        'food truck',
        'catering',
        'mithai',
        'sweet shop',
        'dhaba',
        'cloud kitchen',
    ],
    fitness: ['gym', 'fitness', 'workout', 'crossfit', 'yoga', 'pilates', 'personal trainer', 'training studio'],
    healthcare: ['clinic', 'hospital', 'dental', 'doctor', 'medical', 'physiotherapy', 'pharmacy'],
    photography: ['photographer', 'photography', 'photo studio'],
    portfolio: ['portfolio', 'freelancer', 'designer portfolio'],
    education: ['school', 'college', 'academy', 'tuition', 'coaching centre', 'coaching center'],
    travel: ['travel agency', 'tour operator', 'hotel', 'resort', 'homestay'],
    event: ['wedding planner', 'wedding', 'conference', 'event venue'],
    store: ['online shop', 'e-commerce', 'ecommerce', 'storefront', 'boutique shop'],
    saas: ['saas', 'software product', 'startup platform'],
    legal: ['law firm', 'lawyer', 'legal practice'],
    real_estate: ['real estate', 'property dealer', 'realtor'],
    nonprofit: ['ngo', 'nonprofit', 'charity'],
};

const FAMILY_LABELS: Record<string, string> = {
    food: 'a restaurant or food business',
    fitness: 'a gym or fitness studio',
    healthcare: 'a clinic or healthcare practice',
    photography: 'a photography business',
    portfolio: 'a portfolio site',
    education: 'a school or coaching centre',
    travel: 'a travel or hospitality business',
    event: 'an event or wedding site',
    store: 'an online shop',
    saas: 'a software product site',
    legal: 'a law firm',
    real_estate: 'a real-estate business',
    nonprofit: 'a nonprofit or charity',
};

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordPattern(keyword: string): RegExp {
    const spaced = escapeRegExp(keyword.replace(/-/g, ' '));
    return new RegExp(`\\b${spaced}\\b`, 'i');
}

export function verticalFamily(vertical: string | null | undefined): string | null {
    const slug = vertical?.trim().toLowerCase();
    if (!slug || slug === 'general-business') return null;

    const text = slug.replace(/-/g, ' ');
    for (const [family, keywords] of Object.entries(VERTICAL_FAMILIES)) {
        if (keywords.some((keyword) => keywordPattern(keyword).test(text))) return family;
    }
    return `slug:${slug}`;
}

export function detectRequestedVerticalFamily(instruction: string): string | null {
    const text = instruction.trim();
    if (!text) return null;

    for (const [family, keywords] of Object.entries(VERTICAL_FAMILIES)) {
        if (keywords.some((keyword) => keywordPattern(keyword).test(text))) return family;
    }
    return null;
}

export function wantsCrossSiteCreation(
    instruction: string,
    opts: { sectionCount: number; hasContentPage: boolean },
): boolean {
    const text = instruction.trim();
    if (!text) return false;
    if (opts.sectionCount <= 0 && !opts.hasContentPage) return false;

    if (opts.sectionCount > 0 && isSiteGenerationRequest(text, opts.sectionCount)) return true;

    if (opts.hasContentPage || opts.sectionCount > 0) {
        if (SECTION_TWEAK.test(text)) return false;
        if (SITE_REQUEST.test(text)) return true;
        if (CROSS_SITE.test(text)) return true;
        if (NEW_SITE_BRIEF.test(text) && text.length >= 18) return true;
    }

    return false;
}

function familyLabel(family: string): string {
    if (family.startsWith('slug:')) {
        return family.slice(5).replace(/-/g, ' ');
    }
    return FAMILY_LABELS[family] ?? 'another kind of business';
}

export function crossVerticalBlockedMessage(currentFamily: string, requestedFamily: string): string {
    const current = familyLabel(currentFamily);
    const requested = familyLabel(requestedFamily);
    return `This site is built for ${current}. Ask can edit copy and layout here, but it cannot turn it into ${requested} — start a new project for that.`;
}

export function resolveCurrentVerticalFamily(opts: {
    vertical?: string | null;
    contextText?: string | null;
}): string | null {
    const fromVertical = verticalFamily(opts.vertical);
    if (fromVertical) return fromVertical;
    if (opts.contextText?.trim()) {
        return detectRequestedVerticalFamily(opts.contextText);
    }
    return null;
}

/**
 * Returns a user-facing rejection when the instruction would create a different business
 * site on top of an existing one; otherwise null (allowed).
 */
export function crossVerticalFirewall(opts: {
    instruction: string;
    vertical?: string | null;
    sectionCount?: number;
    hasContentPage?: boolean;
    contextText?: string | null;
}): string | null {
    const sectionCount = opts.sectionCount ?? 0;
    const hasContentPage = Boolean(opts.hasContentPage);
    const hasExistingSite = sectionCount > 0 || hasContentPage;
    if (!hasExistingSite) return null;

    if (!wantsCrossSiteCreation(opts.instruction, { sectionCount, hasContentPage })) return null;

    const requested = detectRequestedVerticalFamily(opts.instruction);
    if (!requested) return null;

    const current = resolveCurrentVerticalFamily({
        vertical: opts.vertical,
        contextText: opts.contextText,
    });

    if (!current) {
        return crossVerticalBlockedMessage('your current business', requested);
    }
    if (current === requested) return null;
    return crossVerticalBlockedMessage(current, requested);
}
