import { MAX_CLASSIFY_CHARS } from '@/lib/contracts';
import { projectNameFromPrompt } from './name';

export const BRIEF_TONES = ['simple', 'warm', 'bold'] as const;
export type BriefTone = (typeof BRIEF_TONES)[number];

export interface SiteBrief {
    name: string;
    offer: string;
    place: string;
    phone: string;
    hours: string;
    extra: string;
    tone: BriefTone | '';
}

export function emptyBrief(): SiteBrief {
    return { name: '', offer: '', place: '', phone: '', hours: '', extra: '', tone: '' };
}

export function briefFromQuery(q: string): SiteBrief {
    const next = emptyBrief();
    next.offer = q.trim();
    return next;
}

const TONE_LINE: Record<BriefTone, string> = {
    simple: 'keep it clean and simple',
    warm: 'warm and friendly',
    bold: 'bold and energetic',
};

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
    offer: 500,
    place: 80,
    phone: 20,
    hours: 80,
    extra: 200,
} as const;

const LABELS: Record<keyof typeof BRIEF_LIMITS, string> = {
    name: 'The business name',
    offer: 'What they do',
    place: 'The city or area',
    phone: 'The phone number',
    hours: 'The opening hours',
    extra: 'Anything else',
};

export function briefErrors(brief: SiteBrief): string[] {
    const errors: string[] = [];
    if (!clean(brief.name)) errors.push('What is the business called?');
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

    return errors;
}

/**
 * One description the rest of the pipeline already understands.
 * Facts the model is not given, it must not invent — so we only write what was asked.
 */
export function composeBrief(brief: SiteBrief): string {
    const name = clean(brief.name);
    const offer = clean(brief.offer);
    const place = clean(brief.place);
    const parts: string[] = [];

    if (name && offer && place) {
        parts.push(`a website for ${name}, ${offer}, in ${place}`);
    } else if (name && offer) {
        parts.push(`a website for ${name}, ${offer}`);
    } else {
        parts.push(['a website', name, offer, place].filter(Boolean).join(' '));
    }

    if (clean(brief.phone)) parts.push(`phone ${clean(brief.phone)}`);
    if (clean(brief.hours)) parts.push(sentence(brief.hours));
    if (brief.tone) parts.push(TONE_LINE[brief.tone]);
    if (clean(brief.extra)) parts.push(sentence(brief.extra));

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
