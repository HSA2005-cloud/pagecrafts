import type { SectionKey } from '@/lib/contracts';

/**
 * Vague briefs stay on the vertical recipe.
 * Named pages / features in the prompt are treated as requirements.
 */

const PAGE_ASKS: { type: SectionKey; re: RegExp }[] = [
    { type: 'menu', re: /\b(menu(\s+page)?|food menu|our (dishes|menu)|full menu)\b/i },
    { type: 'gallery', re: /\b(galler(y|ies)(\s+page)?|photo(\s+)?grid|picture grid|portfolio(\s+page)?)\b/i },
    { type: 'faq', re: /\b(faq(\s+page)?|frequently asked|q\s*&\s*a|questions?\s+and\s+answers?)\b/i },
    { type: 'team', re: /\b(team(\s+page)?|staff(\s+page)?|meet (the|our)|our (people|chefs?|doctors?|teachers?))\b/i },
    { type: 'testimonials', re: /\b(testimonial|reviews?(\s+page)?|what (customers|clients|patients) say|stories(\s+page)?)\b/i },
    { type: 'services', re: /\b(services(\s+page)?|what (you|we) offer|our (services|packages))\b/i },
    { type: 'about', re: /\b(about(\s+(page|us|me))?|our story)\b/i },
    { type: 'contact', re: /\b(contact(\s+page)?|get in touch|reach us|book(ing)?(\s+page)?)\b/i },
];

/** Cart + table number + waiter ticket — only when they ask for that flow. */
export const TABLE_ORDER_ASK =
    /\b(table\s*number|table\s*#|waiter(\s+view|\s+ticket|\s+queue|\s+orders?)?|kitchen\s+ticket|add to cart|shopping cart|order cart|send (it |the order )?to (the )?waiter|order ticket)\b/i;

const DEFAULT_BRIEF: Partial<Record<SectionKey, string>> = {
    menu: 'the dishes or offerings named in the description — prices only when given, otherwise Varies',
    gallery: 'photos of the work or place named in the description',
    faq: 'short answers to questions a visitor would actually ask from the description',
    team: 'roles this place needs — never invent personal names',
    testimonials: 'what customers say, only if the description supports it; otherwise two short generic lines',
    services: 'the services or packages named in the description',
    about: 'who they are and what they do, from the description',
    contact: 'how to reach them — leave phone, email, address and hours empty unless the description gives them',
};

export function requestedSections(prompt: string): SectionKey[] {
    const text = prompt.trim();
    if (!text) return [];
    const out: SectionKey[] = [];
    for (const ask of PAGE_ASKS) {
        if (ask.re.test(text) && !out.includes(ask.type)) out.push(ask.type);
    }
    if (asksTableOrdering(text) && !out.includes('menu')) out.push('menu');
    return out;
}

export function asksTableOrdering(prompt: string): boolean {
    return TABLE_ORDER_ASK.test(prompt.trim());
}

export function briefForRequested(type: SectionKey): string {
    return DEFAULT_BRIEF[type] ?? `the ${type} page they asked for`;
}

export function isDetailedPageBrief(prompt: string): boolean {
    return requestedSections(prompt).length > 0 || asksTableOrdering(prompt);
}
