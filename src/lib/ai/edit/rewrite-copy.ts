import { model } from '../gateway';
import { contain } from '../containment/envelope';
import { stripFences, sanitise, sanitiseDeep } from '../sanitise';
import type { ContentSchema, Field } from '@/lib/contracts';

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function writableFields(schema: ContentSchema): { path: string; field: Field }[] {
    const out: { path: string; field: Field }[] = [];
    for (const section of schema.sections) {
        for (const field of section.fields) {
            if (field.type === 'image' || field.type === 'color' || field.type === 'select') continue;
            out.push({ path: `${section.key}.${field.key}`, field });
        }
    }
    return out;
}

function clip(value: string, max?: number): string {
    const text = value.replace(/\s+/g, ' ').trim();
    if (!max || text.length <= max) return text;
    return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function currentCopy(schema: ContentSchema, content: Record<string, unknown>): Record<string, unknown> {
    const copy: Record<string, unknown> = {};
    for (const { path, field } of writableFields(schema)) {
        const [sectionKey, fieldKey] = path.split('.');
        const section = (content[sectionKey] ?? {}) as Record<string, unknown>;
        const value = section[fieldKey];
        if (value === undefined) continue;
        if (field.type === 'list' && Array.isArray(value)) {
            copy[path] = value;
            continue;
        }
        if (typeof value === 'string') copy[path] = value;
    }
    return copy;
}

function takeList(field: Field, value: unknown): unknown[] | null {
    if (!Array.isArray(value)) return null;
    const itemSchema = field.itemSchema ?? [];
    return value.map((item) => {
        const rec = asRecord(item) ?? {};
        const next: Record<string, unknown> = {};
        for (const itemField of itemSchema) {
            if (itemField.type === 'image' || itemField.type === 'color') continue;
            const raw = rec[itemField.key];
            if (typeof raw !== 'string') continue;
            next[itemField.key] = clip(sanitise(raw).clean, itemField.maxLength);
        }
        return next;
    });
}

/**
 * Overlay model-proposed words onto the schema. Unknown paths and image/colour
 * fields are ignored so a rewrite cannot smash the layout.
 */
export function mergeRewrittenCopy(
    schema: ContentSchema,
    current: Record<string, unknown>,
    proposed: unknown,
): Record<string, Record<string, unknown>> {
    const incoming = asRecord(proposed) ?? {};
    const next: Record<string, Record<string, unknown>> = {};

    for (const section of schema.sections) {
        const prior = (current[section.key] ?? {}) as Record<string, unknown>;
        const values: Record<string, unknown> = { ...prior };
        const fromSection = asRecord(incoming[section.key]) ?? {};

        for (const field of section.fields) {
            const path = `${section.key}.${field.key}`;
            const raw = field.key in fromSection ? fromSection[field.key] : incoming[path];
            if (raw === undefined) continue;

            if (field.type === 'list') {
                const list = takeList(field, raw);
                if (list) values[field.key] = list;
                continue;
            }
            if (field.type === 'image' || field.type === 'color' || field.type === 'select') continue;
            if (typeof raw !== 'string') continue;
            const clean = clip(sanitise(raw).clean, field.maxLength);
            if (clean) values[field.key] = clean;
        }

        next[section.key] = values;
    }

    return next;
}

export async function rewriteTemplateCopy(
    schema: ContentSchema,
    content: Record<string, unknown>,
    instruction: string,
): Promise<{ content: Record<string, Record<string, unknown>>; explanation: string; usage: {
    provider?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
} }> {
    const copy = currentCopy(schema, content);
    // Page copy is untrusted (FR-110). The instruction is not — it was typed by
    // the person who owns the project, same as proposeEdit.
    const contained = contain(
        'Rewrite the words on a website. Keep the same structure. Do not invent a phone, email, address or price that the instruction does not give. Return JSON only.',
        { content: JSON.stringify(copy) },
    );
    const reply = await model.fast.complete({
        job: 'edit',
        system: contained.system,
        user: [
            'Rewrite the words on this page.',
            `Instruction: ${instruction.trim()}`,
            `Current copy: ${contained.values.content}`,
            'Reply with JSON: {"explanation":"...","values":{"hero":{"headline":"..."}}}',
            'Only include fields you are changing. Never include image fields.',
        ].join('\n'),
    });

    let parsed: unknown;
    try {
        parsed = JSON.parse(stripFences(reply.text));
    } catch {
        throw new Error('The suggestion was not readable.');
    }

    const rec = asRecord(parsed);
    if (!rec) throw new Error('The suggestion was not readable.');

    const values = sanitiseDeep(rec.values ?? rec);
    const merged = mergeRewrittenCopy(schema, content, values);
    const explanation =
        sanitise(typeof rec.explanation === 'string' ? rec.explanation : '').clean ||
        'A change is ready to review.';

    return {
        content: merged,
        explanation,
        usage: {
            provider: reply.provider,
            model: reply.model,
            inputTokens: reply.inputTokens,
            outputTokens: reply.outputTokens,
            latencyMs: reply.latencyMs,
        },
    };
}
