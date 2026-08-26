import { MAX_CLASSIFY_CHARS } from '@/lib/contracts';
import { projectNameFromPrompt } from './name';
import { briefClarityErrors } from './clarity';

export interface SiteBrief {
    name: string;
    /** Exact trade/profession — primary signal for vertical + photo subjects. */
    profession: string;
    offer: string;
    place: string;
    phone: string;
    hours: string;
    extra: string;
}

export function emptyBrief(): SiteBrief {
    return {
        name: '',
        profession: '',
        offer: '',
        place: '',
        phone: '',
        hours: '',
        extra: '',
    };
}

export function briefFromQuery(q: string): SiteBrief {
    const next = emptyBrief();
    next.offer = q.trim();
    return next;
}

function clean(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function sentence(value: string): string {
    const text = clean(value);
    if (!text) return '';
    return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** Missing required facts. Empty array means the brief is ready to generate. */
/**
 * The same caps createProjectSchema enforces, in one place so the form and the route cannot
 * disagree. brief-limits.test.ts holds them to the Zod schema.
 *
 * Somebody pasted a 4,500-character specification into `offer` -- a real brief, with
 * sections and sample classes and colour tokens. The box gave no hint of a limit, counted
 * nothing, and the answer came back as "Something in that was not accepted", which named
 * neither the field nor the reason. The rejection was right; everything around it was not.
 */
export const BRIEF_LIMITS = {
    name: 80,
    profession: 80,
    offer: 500,
    place: 80,
    phone: 20,
    hours: 80,
    extra: 200,
} as const;

const LABELS: Record<keyof typeof BRIEF_LIMITS, string> = {
    name: 'The business name',
    profession: 'The profession or trade',
    offer: 'What they do',
    place: 'The city or area',
    phone: 'The phone number',
    hours: 'The opening hours',
    extra: 'Anything else',
};

export function briefErrors(brief: SiteBrief): string[] {
    const errors: string[] = [];
    if (!clean(brief.name)) errors.push('What is the business called?');
    if (!clean(brief.profession)) {
        errors.push('What profession or trade is this — dentist, bakery, plumber…?');
    }
    if (!clean(brief.offer)) errors.push('What do they do? A shop, a clinic, the services.');
    if (!clean(brief.place)) errors.push('Where is it — a city or neighbourhood?');

    for (const [field, limit] of Object.entries(BRIEF_LIMITS)) {
        const written = clean(brief[field as keyof typeof BRIEF_LIMITS]).length;
        if (written <= limit) continue;

        errors.push(
            `${LABELS[field as keyof typeof BRIEF_LIMITS]} is ${written.toLocaleString()} characters. ` +
                `The most it takes is ${limit.toLocaleString()} — shorten it by ${(written - limit).toLocaleString()}.`,
        );
    }

    if (errors.length === 0) {
        errors.push(...briefClarityErrors(brief));
    }

    return errors;
}

/**
 * One description the rest of the pipeline already understands.
 * Facts the model is not given, it must not invent — so we only write what was asked.
 *
 * Profession leads (and is tagged) so classify + photo search know the trade before
 * services copy. Business name follows as the specialty within that trade.
 */
export function composeBrief(brief: SiteBrief): string {
    const name = clean(brief.name);
    const profession = clean(brief.profession);
    const offer = clean(brief.offer);
    const place = clean(brief.place);
    const parts: string[] = [];

    // Tagged first so photoSearchQuery / truncate-to-160 still see the trade.
    if (profession) parts.push(`Profession field: ${profession}`);

    if (name && profession && offer && place) {
        parts.push(
            `a website for ${name}, a ${profession} business (${offer}), in ${place}`,
        );
    } else if (name && profession && place) {
        parts.push(`a website for ${name}, a ${profession} business, in ${place}`);
    } else if (name && offer && place) {
        parts.push(`a website for ${name}, ${offer}, in ${place}`);
    } else if (name && offer) {
        parts.push(`a website for ${name}, ${offer}`);
    } else {
        parts.push(
            ['a website', name, profession, offer, place].filter(Boolean).join(' '),
        );
    }

    if (profession && name) {
        parts.push(
            `photographs must show ${profession} work specific to ${name}, not a generic unrelated trade`,
        );
    } else if (profession) {
        parts.push(
            `profession and photo subjects must match ${profession} exactly — not a different trade`,
        );
    }
    if (clean(brief.phone)) parts.push(`phone ${clean(brief.phone)}`);
    if (clean(brief.hours)) parts.push(sentence(clean(brief.hours)));
    if (clean(brief.extra)) parts.push(sentence(clean(brief.extra)));

    const joined = parts
        .map((part, i) => (i === 0 ? part : part.charAt(0).toLowerCase() + part.slice(1)))
        .join('. ')
        .replace(/\.\./g, '.')
        .replace(/\s+/g, ' ')
        .trim();

    if (joined.length <= MAX_CLASSIFY_CHARS) return joined;
    return `${joined.slice(0, MAX_CLASSIFY_CHARS - 1).trimEnd()}…`;
}

export function projectNameFromBrief(brief: SiteBrief): string {
    const name = clean(brief.name);
    if (name) return projectNameFromPrompt(name);
    return projectNameFromPrompt(composeBrief(brief));
}
