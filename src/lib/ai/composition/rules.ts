import { MAX_SECTIONS, SECTION_KEYS, type SectionKey } from '@/lib/contracts';
import { variantsFor } from '../sections/contracts';
import { nativeHeadingBrief, primaryNativeName } from './language';
import {
    asksTableOrdering,
    briefForRequested,
    requestedSections,
} from './requested-pages';

/** As proposed by the model; `type` is unvalidated. */
export interface PlannedSection {
    type: string;
    variant: string;
    brief: string;
}

/** After normalisation; `type` is a registered key. */
export interface NormalisedSection {
    type: SectionKey;
    variant: string;
    brief: string;
}

export interface NormalisedPlan {
    sections: NormalisedSection[];
    repairs: string[];
}

const KNOWN_TYPES = new Set<string>(SECTION_KEYS);
const isSectionKey = (t: string): t is SectionKey => KNOWN_TYPES.has(t);

/** Social-proof and extras — drop these before contact when the page is full. */
const DISPENSABLE: readonly SectionKey[] = [
    'testimonials', 'team', 'faq', 'gallery', 'menu',
];

/**
 * D11 v22: "register link" / venue still produced a 7-section page with no
 * contact, because ORDER puts contact last and the cap slices the tail.
 */
const CONTACT_HINT =
    /\b(register|sign[- ]?up|book|booking|venue|address|phone|email|whatsapp|contact|reach|rsvp)\b/i;

/**
 * D11 v27: the prompt was "a website". The plan still spent a slot on
 * testimonials, then fill emitted empty quotes and died at validation.
 */
const BARE_PAGE = /^(a |the )?(website|site|page|webpage)\.?$/i;

/** "just the posts and an about" — extras the library likes to add anyway. */
const SCOPED_ASK =
    /\b(just|only|nothing (else|flashy)|keep it minimal)\b/i;

const WRITING_ASK = /\b(posts|articles?|writing|blog)\b/i;

/**
 * D15 v23: "personal site for myself, what i do where i have worked" was
 * planned as a resume-writing shop with priced packages. First-person about
 * a person is not a client-services business.
 */
const PERSONAL_SITE =
    /\b(personal site|for myself|what i do\b.{0,40}\bwhere i( have|'ve)? worked)\b/i;
const RESUME_SHOP =
    /\b(resume.?writ|cv.?writ|resume service|for (clients|customers)|career coach)\b/i;

const ABOUT_ME = /\b(a bit about me|about me)\b/i;
const DONATE_ASK = /\b(donat|volunteer)/i;

/**
 * D15 v21: "pricing table" produced features + an FAQ that said "see our
 * pricing page". The page is the table; a missing-page punt is not.
 */
const PRICING_ASK =
    /\b(pricing table|price list|price table|pricing|packages?|priced plans?)\b/i;

const PERSONAL_EXTRAS: readonly SectionKey[] = [
    'testimonials', 'team', 'gallery', 'faq', 'menu',
];
const BARE_EXTRAS: readonly SectionKey[] = [
    'testimonials', 'team', 'gallery', 'faq', 'menu', 'services',
];

const WRITING_BRIEF =
    'recent posts about the topics in the description, with real titles and one-line descriptions — never "Add a post title here"';
const PERSONAL_WORK_BRIEF =
    'roles and places they have worked — a timeline of their jobs, not resume packages, not prices, not a service sold to clients';
const PERSONAL_HERO_BRIEF =
    'first person: what this person does and where they have worked — never a resume-writing shop, never "Your Name", never packages for clients';
const PERSONAL_ABOUT_BRIEF =
    'first person, their own work history in a few sentences. Not a mission to help clients. Do not invent employers or years';
const BARE_HERO_BRIEF =
    'a short generic site in real sentences — heading names the page, never "Add heading here" or "Your Name"';
const TEAM_BRIEF =
    'job titles this practice needs, one role per row — never "Attorney Name" or a dummy name; years of practice only if the description gives a number';
const ABOUT_ME_BRIEF =
    'first person about the person who asked — training, why they started, how they teach. Not "our studio"';
const PRICING_BRIEF =
    'pricing table on this page: named plans or packages. If the description gave no amounts, omit numbers or write Varies — never invent ₹ or $, never "see our pricing page"';
const PRICING_FAQ_NOTE =
    'answer pricing on this page; never "see our pricing page"';

export interface NormalisePlanOptions {
    prompt?: string;
    required?: readonly SectionKey[];
}

export function needsContact(prompt: string): boolean {
    return CONTACT_HINT.test(prompt);
}

export function isUnderspecified(prompt: string): boolean {
    const t = prompt.trim();
    return t.length < 24 || BARE_PAGE.test(t);
}

export function isBarePage(prompt: string): boolean {
    return BARE_PAGE.test(prompt.trim());
}

/** A page about the writer, not a shop that sells that work to clients. */
export function isPersonalSite(prompt: string): boolean {
    return PERSONAL_SITE.test(prompt) && !RESUME_SHOP.test(prompt);
}

export function wantsFirstPersonAbout(prompt: string): boolean {
    return isPersonalSite(prompt) || ABOUT_ME.test(prompt);
}

/** A pricing table / packages / plans ask — the page must show prices, not punt. */
export function wantsPricing(prompt: string): boolean {
    return PRICING_ASK.test(prompt);
}

function rewriteBriefs(
    sections: NormalisedSection[],
    prompt: string,
    repairs: string[],
): void {
    const personal = isPersonalSite(prompt);
    const bare = isBarePage(prompt);
    const firstPerson = wantsFirstPersonAbout(prompt);
    const writing = WRITING_ASK.test(prompt);
    const donate = DONATE_ASK.test(prompt);
    const pricing = wantsPricing(prompt) && !personal && !bare && !writing;
    const nativeName = primaryNativeName(prompt);

    for (const s of sections) {
        const before = s.brief;

        if (personal) {
            if (s.type === 'hero') s.brief = PERSONAL_HERO_BRIEF;
            else if (s.type === 'about') s.brief = PERSONAL_ABOUT_BRIEF;
            else if (s.type === 'services') {
                const timeline = variantsFor('services').find((v) => v === 'timeline');
                if (timeline) s.variant = timeline;
                s.brief = PERSONAL_WORK_BRIEF;
            } else if (s.type === 'contact') {
                s.brief = 'how to reach this person; leave phone, email, address and hours empty unless the description gives them';
            } else if (s.type === 'footer') {
                s.brief = 'one line about this person, not a business selling to clients';
            }
        } else if (bare) {
            if (s.type === 'hero') s.brief = BARE_HERO_BRIEF;
            else if (s.type === 'about') {
                s.brief = 'three honest sentences about a simple website; do not invent a company, a history, or a mission';
            } else if (s.type === 'contact') {
                s.brief = 'how to get in touch; phone, email, address and hours stay empty';
            } else if (s.type === 'footer') {
                s.brief = 'one real sentence about this page, not "trusted partner"';
            } else if (s.type === 'services') {
                s.brief = 'two or three generic things a simple site might list, in real words, never "Add a title here"';
            }
        } else {
            if (firstPerson && s.type === 'about') s.brief = ABOUT_ME_BRIEF;
            if (writing && s.type === 'services') s.brief = WRITING_BRIEF;
            if (donate && s.type === 'hero' && !/\b(donat|volunteer)/i.test(s.brief)) {
                s.brief = `${s.brief.replace(/\s*\.?\s*$/, '')} — primary CTA is Donate or Volunteer, not Enroll`;
            }
            if (s.type === 'team') s.brief = TEAM_BRIEF;
            if (s.type === 'contact' && !/empty unless/i.test(s.brief)) {
                s.brief = `${s.brief.replace(/\s*\.?\s*$/, '')} — leave phone, email, address and hours empty unless the description gives them`;
            }
            if (pricing && (s.type === 'services' || s.type === 'menu')) {
                s.brief = PRICING_BRIEF;
                if (s.type === 'services') {
                    const cards = variantsFor('services').find((v) => v === 'cards');
                    if (cards) s.variant = cards;
                } else {
                    const grouped = variantsFor('menu').find((v) => v === 'grouped');
                    if (grouped) s.variant = grouped;
                }
            }
            if (pricing && s.type === 'faq' && !/see our pricing page/i.test(s.brief)) {
                s.brief = `${s.brief.replace(/\s*\.?\s*$/, '')} — ${PRICING_FAQ_NOTE}`;
            }
            if (asksTableOrdering(prompt) && s.type === 'hero' && !/order now/i.test(s.brief)) {
                s.brief = `${s.brief.replace(/\s*\.?\s*$/, '')} — primary CTA label is Order now (sends to the waiter, not payment)`;
            }
            if (asksTableOrdering(prompt) && s.type === 'menu' && !/cart|table|waiter/i.test(s.brief)) {
                s.brief = `${s.brief.replace(/\s*\.?\s*$/, '')} — dishes guests can add to a cart and send to the waiter with a table number`;
            }
        }

        if (nativeName && (s.type === 'hero' || s.type === 'about' || s.type === 'footer')
            && !s.brief.includes(nativeName)) {
            s.brief = `${s.brief.replace(/\s*\.?\s*$/, '')} — ${nativeHeadingBrief(nativeName)}`;
        }

        if (s.brief !== before) {
            repairs.push(`rewrote ${s.type} brief — copy must match the job in the description`);
        }
    }
}

const ASKED_GALLERY =
    /\b(galler(y|ies)|photos?|pictures?|portfolio|our work)\b/i;
const ASKED_TESTIMONIALS =
    /\b(testimonial|reviews?|what (customers|clients|patients) say|ratings?)\b/i;
const ASKED_TEAM =
    /\b(team|staff|teachers?|chefs?|doctors?|our people|who we are|meet (the|our))\b/i;

export function normalisePlan(
    sections: PlannedSection[],
    opts: NormalisePlanOptions = {},
): NormalisedPlan {
    const repairs: string[] = [];

    const valid: NormalisedSection[] = [];
    for (const s of sections) {
        if (!isSectionKey(s.type)) {
            repairs.push(`dropped unknown section type "${s.type}"`);
            continue;
        }
        const allowed = variantsFor(s.type);
        if (allowed.includes(s.variant)) {
            valid.push({ type: s.type, variant: s.variant, brief: s.brief });
        } else {
            repairs.push(`${s.type}: "${s.variant}" not registered — used "${allowed[0]}"`);
            valid.push({ type: s.type, variant: allowed[0], brief: s.brief });
        }
    }

    const hero = valid.find((s) => s.type === 'hero');
    const footer = valid.find((s) => s.type === 'footer');

    let middle = valid
        .filter((s) => s.type !== 'hero' && s.type !== 'footer')
        .filter((s, i, arr) =>
            i === 0 || !(arr[i - 1].type === s.type && arr[i - 1].variant === s.variant));

    const reserved = (hero ? 1 : 0) + (footer ? 1 : 0);
    const prompt = opts.prompt ?? '';
    const wantContact = (opts.required ?? []).includes('contact')
        || (prompt !== '' && needsContact(prompt));

    if (prompt && isUnderspecified(prompt)) {
        const drop = isBarePage(prompt) ? BARE_EXTRAS : (['testimonials', 'team'] as const);
        const before = middle.length;
        middle = middle.filter((s) => !(drop as readonly string[]).includes(s.type));
        if (middle.length < before) {
            repairs.push(isBarePage(prompt)
                ? 'dropped extras — a bare "website" has nothing to catalogue or quote'
                : 'dropped testimonials/team — description names no business to quote');
        }
    }

    if (prompt && isPersonalSite(prompt)) {
        const before = middle.length;
        middle = middle.filter((s) => !PERSONAL_EXTRAS.includes(s.type));
        if (middle.length < before) {
            repairs.push('dropped extras — this is a page about the person, not a client-services shop');
        }
    }

    if (prompt && SCOPED_ASK.test(prompt)) {
        const asked = new Set(requestedSections(prompt));
        const before = middle.length;
        middle = middle.filter((s) =>
            asked.has(s.type)
            || (s.type !== 'testimonials' && s.type !== 'faq' && s.type !== 'menu'));
        if (middle.length < before) {
            repairs.push('dropped extras — description asked for a short page');
        }
    }

    if (prompt) {
        const unasked: SectionKey[] = [];
        if (!ASKED_GALLERY.test(prompt)) unasked.push('gallery');
        if (!ASKED_TESTIMONIALS.test(prompt)) unasked.push('testimonials');
        if (!ASKED_TEAM.test(prompt)) unasked.push('team');
        if (unasked.length) {
            const before = middle.length;
            middle = middle.filter((s) => !unasked.includes(s.type));
            if (middle.length < before) {
                repairs.push('dropped gallery/testimonials/team — description did not ask for them');
            }
        }
    }

    if (prompt && WRITING_ASK.test(prompt)
        && !middle.some((s) => s.type === 'services' || s.type === 'menu')) {
        const budget = MAX_SECTIONS - reserved - (wantContact ? 1 : 0);
        if (middle.length < budget) {
            middle.push({
                type: 'services',
                variant: 'cards',
                brief: WRITING_BRIEF,
            });
            repairs.push('inserted services as posts — description asked for writing, not testimonials');
        }
    }

    if (prompt && isPersonalSite(prompt)
        && !middle.some((s) => s.type === 'services')) {
        const budget = MAX_SECTIONS - reserved - (wantContact ? 1 : 0);
        if (middle.length < budget) {
            middle.push({
                type: 'services',
                variant: 'timeline',
                brief: PERSONAL_WORK_BRIEF,
            });
            repairs.push('inserted services as work history — description asked what they have done, not a shop');
        }
    }

    if (prompt && wantsPricing(prompt) && !isPersonalSite(prompt) && !isBarePage(prompt)
        && !WRITING_ASK.test(prompt)
        && !middle.some((s) => s.type === 'services' || s.type === 'menu')) {
        const budget = MAX_SECTIONS - reserved - (wantContact ? 1 : 0) - 1;
        while (middle.length > budget) {
            let i = -1;
            for (const type of DISPENSABLE) {
                if (type === 'menu') continue;
                i = middle.findLastIndex((s) => s.type === type);
                if (i >= 0) break;
            }
            if (i < 0) break;
            repairs.push(`dropped ${middle[i].type} to keep a pricing section`);
            middle.splice(i, 1);
        }
        if (middle.length <= budget) {
            middle.push({
                type: 'services',
                variant: 'cards',
                brief: PRICING_BRIEF,
            });
            repairs.push('inserted services as pricing — description asked for a pricing table');
        }
    }

    if (prompt) {
        const asked = requestedSections(prompt);
        for (const type of asked) {
            if (type === 'hero' || type === 'footer') continue;
            if (middle.some((s) => s.type === type)) continue;
            const budget = MAX_SECTIONS - reserved - (wantContact && type !== 'contact' ? 1 : 0) - 1;
            while (middle.length > budget) {
                let i = -1;
                for (const drop of DISPENSABLE) {
                    if (asked.includes(drop)) continue;
                    i = middle.findLastIndex((s) => s.type === drop);
                    if (i >= 0) break;
                }
                if (i < 0) break;
                repairs.push(`dropped ${middle[i].type} to keep the ${type} page they asked for`);
                middle.splice(i, 1);
            }
            if (middle.length <= budget) {
                const allowed = variantsFor(type);
                middle.push({
                    type,
                    variant: allowed[0],
                    brief: briefForRequested(type),
                });
                repairs.push(`inserted ${type} — description asked for that page`);
            }
        }
    }

    if (wantContact && !middle.some((s) => s.type === 'contact')) {
        const budget = MAX_SECTIONS - reserved - 1;
        while (middle.length > budget) {
            let i = -1;
            for (const type of DISPENSABLE) {
                i = middle.findLastIndex((s) => s.type === type);
                if (i >= 0) break;
            }
            if (i < 0) break;
            repairs.push(`dropped ${middle[i].type} to keep contact`);
            middle.splice(i, 1);
        }
        if (middle.length <= budget) {
            const variant = variantsFor('contact')[0] ?? 'simple';
            middle.push({
                type: 'contact',
                variant,
                brief: 'how to register, reach, or find this place',
            });
            repairs.push('inserted contact — description asked how to reach or register');
        }
    }

    if (prompt) {
        rewriteBriefs(
            [...(hero ? [hero] : []), ...middle, ...(footer ? [footer] : [])],
            prompt,
            repairs,
        );
    }

    const out = [
        ...(hero ? [hero] : []),
        ...middle.slice(0, MAX_SECTIONS - reserved),
        ...(footer ? [footer] : []),
    ];

    for (let i = 1; i < out.length; i += 1) {
        if (out[i].variant !== out[i - 1].variant) continue;
        const alt = variantsFor(out[i].type).find((v) => v !== out[i - 1].variant);
        if (alt) out[i] = { ...out[i], variant: alt };
    }

    return { sections: out, repairs };
}
