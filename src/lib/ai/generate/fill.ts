import { model, GatewayError } from '../gateway';
import { aiConfig } from '../config';
import { loadTemplate, render } from '../harness/templates';
import { guidanceFor } from '../harness/guidance';
import { stripFences, sanitiseDeep, containsHtmlTag } from '../sanitise';
import { contractFor, scrubOptionalFields, coerceUngroundedPrices } from '../sections/contracts';
import { preserveNativeFields } from '../composition/language';
import { contain } from '../containment/envelope';
import type { SectionInstance, SectionProps, AiResult } from '@/lib/contracts';

export interface FillContext {
    vertical: string;
    tone: string;
    prompt: string;
    customerWord: string;
}

export async function fillSection(
    instance: SectionInstance,
    context: FillContext,
    repairContext?: string,
): Promise<AiResult<SectionProps>> {
    const contract = contractFor(instance.type);
    const tpl = loadTemplate(aiConfig().prompts.fill);

    // The person's description and the planner's brief are both text this stage
    // must write *about*, never text it takes orders from (FR-110).
    const contained = contain(
        render(tpl.system, {
            vertical: context.vertical,
            customerWord: context.customerWord,
            // v1 does not name {{guidance}}; supplying it is harmless there and
            // is what makes per-section-type voice possible in v2.
            guidance: guidanceFor(instance.type),
        }),
        { prompt: context.prompt, brief: instance.brief },
    );

    const user = render(tpl.user, {
        sectionKey: instance.type,
        variant: instance.variant,
        brief: contained.values.brief,
        tone: context.tone,
        fields: contract.fieldList,
        prompt: contained.values.prompt,
    });

    const reply = await model.strong.complete({
        job: 'generate',
        prefer: 'groq',
        system: contained.system,
        user: repairContext ? `${user}\n\n${repairContext}` : user,
        schema: contract.json,
    });

    const raw = JSON.parse(stripFences(reply.text));
    const usage = { ...reply, promptVersion: `${tpl.id}.${tpl.version}` };

    // TC-038 / v3 fill contract: content fields, never markup. A tag is a
    // validation failure (repairable), not something we strip and keep.
    if (containsHtmlTag(raw)) {
        throw new GatewayError(
            'generation_failed',
            `fillSection(${instance.type}): HTML is not allowed in content fields`,
            false,
            {
                raw: reply.text,
                usage,
                issues: [{ path: [], message: 'HTML is not allowed in content fields' }],
            },
        );
    }

    const clean = sanitiseDeep(raw);

    // Groq/Cerebras may return image fields as a plain string instead of
    // { query, alt }. Coerce before validation so one bad shape doesn't
    // sink the whole section.
    const imageKeys = new Set(
        contract.fields.filter((f) => f.type === 'image').map((f) => f.key),
    );
    if (clean && typeof clean === 'object') {
        const obj = clean as Record<string, unknown>;
        const fallbackStr = `${context.vertical} ${instance.type}`;
        for (const key of imageKeys) {
            const val = obj[key];
            if (typeof val === 'string') {
                const q = val.trim() || fallbackStr;
                obj[key] = { query: q, alt: q };
            } else if (val && typeof val === 'object') {
                const imgObj = val as Record<string, unknown>;
                const q = (typeof imgObj.query === 'string' && imgObj.query.trim()) || fallbackStr;
                const a = (typeof imgObj.alt === 'string' && imgObj.alt.trim()) || q;
                obj[key] = { query: q, alt: a };
            } else {
                obj[key] = { query: fallbackStr, alt: fallbackStr };
            }
        }

        // Provider models may return alternative key names for list item fields
        // (e.g. `name` instead of `title`, `description` instead of `body`).
        for (const f of contract.fields) {
            if (f.type === 'list' && Array.isArray(obj[f.key])) {
                const items = obj[f.key] as Record<string, unknown>[];
                for (const item of items) {
                    if (item && typeof item === 'object') {
                        if (!item.title && typeof item.name === 'string') item.title = item.name;
                        if (!item.title && typeof item.heading === 'string') item.title = item.heading;
                        if (!item.body && typeof item.description === 'string') item.body = item.description;
                        if (!item.body && typeof item.detail === 'string') item.body = item.detail;
                        if (!item.body && typeof item.text === 'string') item.body = item.text;
                        if (!item.quote && typeof item.text === 'string') item.quote = item.text;
                        if (!item.author && typeof item.name === 'string') item.author = item.name;
                    }
                }
            }
        }
    }

    if (clean && typeof clean === 'object') {
        scrubOptionalFields(clean as Record<string, unknown>, contract.fields, context.prompt);
        coerceUngroundedPrices(clean as Record<string, unknown>, contract.fields, context.prompt);
        const maxByKey = Object.fromEntries(
            contract.fields
                .filter((f) => f.key === 'heading' || f.key === 'tagline')
                .map((f) => [f.key, f.maxLength]),
        );
        preserveNativeFields(clean as Record<string, unknown>, context.prompt, maxByKey);
    }

    const parsed = contract.fill.safeParse(clean);
    if (!parsed.success) {
        throw new GatewayError('generation_failed', `fillSection(${instance.type}): model output failed validation`, false, {
            raw: reply.text,
            issues: parsed.error.issues,
            usage,
        });
    }

    return { data: parsed.data as SectionProps, usage };
}
