import { z } from 'zod';
import { Type, type Schema } from '@google/genai';
import type { Field, SectionKey } from '@/lib/contracts';

export interface SectionContract {
    type: SectionKey;
    label: string;
    variants: string[];
    fields: Field[];
    fill: z.ZodTypeAny;
    json: Schema;
    fieldList: string;
}

const MODEL_FILLABLE: ReadonlySet<Field['type']> = new Set([
    'text', 'richtext', 'image', 'select', 'list',
]);

function textZod(f: Field, fallbackMax: number): z.ZodTypeAny {
    const max = f.maxLength ?? fallbackMax;
    // Optional facts (phone, email) may be "". min(1) is what forced
    // "Not listed" / "XXXXXXXXXX" and then failed the human sheet.
    return f.optional ? z.string().max(max) : z.string().min(1).max(max);
}

function zodForField(f: Field): z.ZodTypeAny {
    switch (f.type) {
        case 'text': return textZod(f, 120);
        case 'richtext': return textZod(f, 900);
        case 'image': return z.object({
            query: z.string().min(1).max(80),
            alt: z.string().min(1).max(120),
        });
        case 'select': return z.enum((f.options ?? ['default']) as [string, ...string[]]);
        case 'list': return z.array(zodForFields(f.itemSchema ?? []))
            .min(1).max(f.maxLength ?? 8);
        case 'color': throw new Error(`Field "${f.key}": colour is never model-filled.`);
        default: {
            const exhaustive: never = f.type;
            return exhaustive;
        }
    }
}

function zodForFields(fields: Field[]) {
    return z.object(Object.fromEntries(
        fields.filter((f) => MODEL_FILLABLE.has(f.type)).map((f) => [f.key, zodForField(f)]),
    ));
}

function jsonForField(f: Field): Schema {
    switch (f.type) {
        case 'text':
        case 'richtext': return { type: Type.STRING };
        case 'image': return {
            type: Type.OBJECT,
            properties: { query: { type: Type.STRING }, alt: { type: Type.STRING } },
            required: ['query', 'alt'],
            propertyOrdering: ['query', 'alt'],
        };
        case 'select': return { type: Type.STRING, enum: f.options ?? [] };
        case 'list': return { type: Type.ARRAY, items: jsonForFields(f.itemSchema ?? []) };
        case 'color': throw new Error(`Field "${f.key}": colour is never model-filled.`);
        default: {
            const exhaustive: never = f.type;
            return exhaustive;
        }
    }
}

function jsonForFields(fields: Field[]): Schema {
    const usable = fields.filter((f) => MODEL_FILLABLE.has(f.type));
    // Keys stay in `required` even when optional: Groq json_schema strict
    // rejects missing properties. Optional means the string may be "".
    return {
        type: Type.OBJECT,
        properties: Object.fromEntries(usable.map((f) => [f.key, jsonForField(f)])),
        required: usable.map((f) => f.key),
        propertyOrdering: usable.map((f) => f.key),
    };
}

function define(
    type: SectionKey, label: string, variants: string[], fields: Field[],
): SectionContract {
    const usable = fields.filter((f) => MODEL_FILLABLE.has(f.type));
    return {
        type, label, variants, fields,
        fill: zodForFields(fields),
        json: jsonForFields(fields),
        fieldList: usable.map((f) => f.key).join(', '),
    };
}

const t = (key: string, label: string, maxLength?: number, optional = false): Field =>
    ({ key, label, type: 'text', ...(maxLength ? { maxLength } : {}), ...(optional ? { optional } : {}) });
const rt = (key: string, label: string, maxLength?: number, optional = false): Field =>
    ({ key, label, type: 'richtext', ...(maxLength ? { maxLength } : {}), ...(optional ? { optional } : {}) });
const img = (key: string, label: string): Field => ({ key, label, type: 'image' });
const list = (key: string, label: string, itemSchema: Field[], maxLength: number): Field =>
    ({ key, label, type: 'list', itemSchema, maxLength });

export const SECTION_CONTRACTS: Record<SectionKey, SectionContract> = {
    hero: define('hero', 'Hero', ['centred', 'split-image', 'image-bg', 'minimal'], [
        t('eyebrow', 'Eyebrow', 60),
        t('heading', 'Heading', 80),
        rt('sub', 'Subheading', 200),
        t('ctaLabel', 'Button label', 40),
        img('image', 'Image'),
    ]),
    about: define('about', 'About', ['text', 'media-split'], [
        t('heading', 'Heading'), rt('body', 'Body', 900), img('image', 'Image'),
    ]),
    services: define('services', 'Services', ['cards', 'grid', 'timeline', 'tabs'], [
        t('heading', 'Heading'),
        list('items', 'Items', [t('title', 'Title', 60), rt('body', 'Description', 240)], 8),
    ]),
    menu: define('menu', 'Menu', ['grouped', 'simple'], [
        t('heading', 'Heading'),
        list('items', 'Items', [
            t('name', 'Name', 60), rt('description', 'Description', 160), t('price', 'Price', 20),
        ], 20),
    ]),
    gallery: define('gallery', 'Gallery', ['masonry', 'grid', 'carousel'], [
        t('heading', 'Heading'),
        list('images', 'Images', [t('query', 'Search', 80), t('alt', 'Description', 120)], 12),
    ]),
    team: define('team', 'Team', ['cards', 'grid'], [
        t('heading', 'Heading'),
        list('members', 'Members', [
            t('name', 'Name', 60), t('role', 'Role', 60), rt('bio', 'Bio', 240),
        ], 8),
    ]),
    testimonials: define('testimonials', 'Testimonials', ['quotes', 'cards'], [
        t('heading', 'Heading'),
        list('items', 'Quotes', [rt('quote', 'Quote', 300), t('author', 'Name', 60)], 6),
    ]),
    faq: define('faq', 'FAQ', ['accordion', 'two-column'], [
        t('heading', 'Heading'),
        list('items', 'Questions', [
            t('question', 'Question', 140), rt('answer', 'Answer', 500),
        ], 10),
    ]),
    contact: define('contact', 'Contact', ['split-map', 'simple', 'form'], [
        t('heading', 'Heading'), rt('blurb', 'Intro', 240),
        t('address', 'Address', 200, true), t('phone', 'Phone', 40, true),
        t('email', 'Email', 80, true), t('hours', 'Opening hours', 200, true),
    ]),
    footer: define('footer', 'Footer', ['simple', 'columns'], [
        t('tagline', 'Tagline', 120),
    ]),
};

export function contractFor(type: SectionKey): SectionContract {
    const c = SECTION_CONTRACTS[type];
    if (!c) throw new Error(`No content contract for section type "${type}".`);
    return c;
}

export function variantsFor(type: SectionKey): string[] {
    return contractFor(type).variants;
}

const DUMMY_EMAIL =
    /@(?:example\.(?:com|org|net)|test\.(?:com|org)|email\.com|domain\.com|your(?:business|company|studio)?\.com)\b/i;

const EMAIL_FIND = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function digitsOnly(value: string): string {
    return value.replace(/\D/g, '');
}

/** Strip a leading country code / trunk 0 so "080 4123 7788" matches "+91 80 4123 7788". */
function phoneCore(digits: string): string {
    let s = digits;
    if (s.startsWith('91') && s.length >= 12) s = s.slice(2);
    if (s.startsWith('1') && s.length === 11) s = s.slice(1);
    return s.replace(/^0+/, '');
}

/** NANP 555 / 1-800-555 placeholders. A real 555 the prompt gave is kept by grounding. */
export function isPlaceholderPhone(value: string): boolean {
    const d = digitsOnly(value);
    if (!d) return false;
    if (/55501\d{2}/.test(d)) return true;
    if (/^555\d{4}$/.test(d)) return true;
    if (/^1?555\d{7}$/.test(d)) return true;
    if (/^\d{3}555\d{4}$/.test(d)) return true;
    if (/^1\d{3}555\d{4}$/.test(d)) return true;
    return false;
}

export function isPlaceholderEmail(value: string): boolean {
    return DUMMY_EMAIL.test(value.trim());
}

export function phoneGroundedInPrompt(value: string, prompt: string): boolean {
    const filled = digitsOnly(value);
    const source = digitsOnly(prompt);
    if (!filled) return false;
    if (filled.length < 7) return filled.length >= 4 && source.includes(filled);
    if (source.includes(filled) || (source.length >= 7 && filled.includes(source))) return true;
    const fc = phoneCore(filled);
    const sc = phoneCore(source);
    if (fc.length >= 7 && (sc.includes(fc) || (sc.length >= 7 && fc.includes(sc)))) return true;
    return false;
}

export function emailGroundedInPrompt(value: string, prompt: string): boolean {
    const v = value.trim().toLowerCase();
    const p = prompt.toLowerCase();
    if (!v.includes('@')) return false;
    if (p.includes(v)) return true;
    const domain = v.slice(v.lastIndexOf('@') + 1);
    return Boolean(domain.includes('.') && p.includes(domain));
}

/**
 * Dummy labels the model writes when it is not allowed to invent a fact and
 * used to be forbidden from returning "". Empty is now legal on optional
 * fields; these strings are not a phone number.
 */
export function isDummyFact(value: string): boolean {
    const t = value.trim();
    if (!t) return true;
    if (/^\[.*]$/.test(t)) return true;
    if (/^(n\/?a|none|not (listed|provided|available)|pending|on request|tbd)$/i.test(t)) {
        return true;
    }
    if (/^(phone number|office address|studio address|your name)$/i.test(t)) return true;
    if (/^add .{0,60} here\.?$/i.test(t)) return true;
    if (isPlaceholderPhone(t) || isPlaceholderEmail(t)) return true;
    const compact = t.replace(/[\s\-().+]/g, '');
    return /^(?:\+?\d*)?x{6,}$/i.test(compact);
}

function shouldScrubOptional(value: string, key: string, prompt?: string): boolean {
    if (prompt !== undefined && prompt !== '' && (key === 'phone' || key === 'email')) {
        const grounded = key === 'phone'
            ? phoneGroundedInPrompt(value, prompt)
            : emailGroundedInPrompt(value, prompt);
        return !grounded;
    }
    return isDummyFact(value);
}

/** Remove phones/emails the description did not give. Leaves ordinary words alone. */
export function stripUngroundedContact(text: string, prompt: string): string {
    return text
        .replace(EMAIL_FIND, (m) => (emailGroundedInPrompt(m, prompt) ? m : ''))
        .replace(
            /(?:\+?\d{1,3}[\s.\u2010-\u2015-]*)?(?:\(?\d{2,4}\)?[\s.\u2010-\u2015-]*){1,3}\d{2,4}/g,
            (m) => (digitsOnly(m).length < 7 || phoneGroundedInPrompt(m, prompt) ? m : ''),
        )
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([.,;:])/g, '$1')
        .replace(/\s+(?:or|and|at)\s*[.,]?$/i, '')
        .trim();
}

function scrubContactBlurb(props: Record<string, unknown>, prompt: string): void {
    if (typeof props.blurb !== 'string') return;
    const next = stripUngroundedContact(props.blurb, prompt);
    if (next === props.blurb) return;
    const stillHasEmail = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(next);
    const stillHasFact = stillHasEmail || digitsOnly(next).length >= 7;
    props.blurb = stillHasFact && next ? next : 'Get in touch.';
}

/** Mutates `props` in place: optional text facts that are dummy become "". */
export function scrubOptionalFields(
    props: Record<string, unknown>,
    fields: Field[],
    prompt?: string,
): Record<string, unknown> {
    for (const f of fields) {
        if (!f.optional || (f.type !== 'text' && f.type !== 'richtext')) continue;
        const v = props[f.key];
        if (typeof v === 'string' && shouldScrubOptional(v, f.key, prompt)) props[f.key] = '';
    }
    if (prompt !== undefined && fields.some((f) => f.key === 'phone' || f.key === 'email')) {
        scrubContactBlurb(props, prompt);
    }
    return props;
}

/** Menu `price` is required; invented ₹/$ amounts become "Varies". */
export function coerceUngroundedPrices(
    props: Record<string, unknown>,
    fields: Field[],
    prompt: string,
): void {
    const sourceDigits = digitsOnly(prompt);
    for (const f of fields) {
        if (f.type !== 'list' || !Array.isArray(props[f.key])) continue;
        if (!(f.itemSchema ?? []).some((item) => item.key === 'price')) continue;
        for (const item of props[f.key] as Record<string, unknown>[]) {
            if (!item || typeof item.price !== 'string') continue;
            const price = item.price.trim();
            if (!price || /^varies$/i.test(price) || price === '—' || price === '-') continue;
            const looksMoney = /[₹$€£]/.test(price)
                || /\b(?:rs\.?|inr|usd|\/mo|\/month|per month)\b/i.test(price);
            if (!looksMoney) continue;
            const d = digitsOnly(price);
            if (d && sourceDigits.includes(d)) continue;
            item.price = 'Varies';
        }
    }
}

/** The variant menu, generated from the registry so the prompt can never drift from it. */
export function variantMenu(): string {
    return Object.values(SECTION_CONTRACTS)
        .map((c) => `${c.type.padEnd(12)} ${c.variants.join(' | ')}`)
        .join('\n');
}