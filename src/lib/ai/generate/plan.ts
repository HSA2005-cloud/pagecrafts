import { model, GatewayError } from '../gateway';
import { aiConfig } from '../config';
import { planSchema } from '../gateway/response-schemas';
import { loadTemplate, render } from '../harness/templates';
import { stripFences } from '../sanitise';
import { contain } from '../containment/envelope';
import { generationPlan } from '@/lib/contracts/schemas/ai';
import { normalisePlan } from '../composition/rules';
import { variantMenu } from '../sections/contracts';
import {
    SECTION_KEYS,
    type IntentAttributes, type VerticalProfile,
    type SectionInstance, type AiResult,
} from '@/lib/contracts';

export async function plan(
    prompt: string,
    intent: IntentAttributes,
    profile: VerticalProfile,
): Promise<AiResult<SectionInstance[]>> {
    const tpl = loadTemplate(aiConfig().prompts.plan);

    const recipe = profile.recipe
        .map((r) => `${r.type}${r.required ? ' (required)' : ''}${r.note ? ` — ${r.note}` : ''}`)
        .join('\n');

    // The description is the person's; the recipe is the profile stage's output.
    // Neither is an instruction to this stage (FR-110).
    const contained = contain(render(tpl.system), { prompt, recipe });

    const reply = await model.strong.complete({
        job: 'generate',
        prefer: 'groq',
        system: contained.system,
        user: render(tpl.user, {
            prompt: contained.values.prompt,
            recipe: contained.values.recipe,
            vertical: intent.vertical,
            tone: intent.tone,
        }),
        schema: planSchema,
    });

    const raw = JSON.parse(stripFences(reply.text));

    // The model should return { "sections": [...] }, but some providers return
    // an object keyed by section type: { "hero": { variant, brief }, ... }.
    // Normalise both shapes into the array the schema expects.
    let rawSections: unknown[];
    if (Array.isArray(raw.sections)) {
        rawSections = raw.sections.slice(0, 7);
    } else if (Array.isArray(raw)) {
        rawSections = raw.slice(0, 7);
    } else if (raw && typeof raw === 'object' && !raw.sections) {
        // Object-keyed format: convert { "hero": { variant, brief } } → [{ type: "hero", variant, brief }]
        rawSections = Object.entries(raw)
            .filter(([, v]) => v && typeof v === 'object')
            .map(([type, props]) => ({ type, ...(props as object) }));
    } else {
        rawSections = [];
    }

    const usage = { ...reply, promptVersion: `${tpl.id}.${tpl.version}` };

    const parsed = generationPlan.safeParse(rawSections);
    if (!parsed.success) {
        throw new GatewayError('generation_failed', 'plan: model output failed validation', false, {
            raw: reply.text,
            issues: parsed.error.issues,
            usage,
        });
    }

    const { sections: planned, repairs } = normalisePlan(parsed.data, {
        prompt,
        required: profile.recipe.filter((r) => r.required).map((r) => r.type),
    });
    if (repairs.length) console.warn(`[plan] ${repairs.join(' · ')}`);

    const sections: SectionInstance[] = planned.map((s, i) => ({
        id: `s_${String(i + 1).padStart(2, '0')}`,
        type: s.type,
        variant: s.variant,
        brief: s.brief,
        visible: true,
        locked: false,
        source: 'ai',
        props: {},
    }));

    return { data: sections, usage };
}