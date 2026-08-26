import { model } from '../gateway';
import { aiConfig } from '../config';
import { loadTemplate, render } from '../harness/templates';
import { contain } from '../containment/envelope';
import { stripFences, sanitise, sanitiseDeep } from '../sanitise';
import { editProposal } from '@/lib/contracts/schemas/ai';
import { editProposalSchema } from '../gateway/response-schemas';
import type {
    SectionInstance, EditProposal, PatchOp, AiResult,
} from '@/lib/contracts';

export async function proposeEdit(
    section: SectionInstance,
    instruction: string,
): Promise<AiResult<EditProposal>> {
    const tpl = loadTemplate(aiConfig().prompts.edit);

    // SEC-43: the section's own content is the untrusted half. The instruction is
    // not — it was typed by the person who owns the project. The content may have
    // been planted by an earlier turn, a template, or injected model output.
    const contained = contain(tpl.system, {
        content: JSON.stringify(section.props, null, 2),
    });

    // Every other stage passes its schema — classify, fill, expand, compose — and that is
    // what puts response_format on the request so the provider has to answer in JSON. This
    // one did not, so a model free to reply in prose sometimes did, JSON.parse threw a
    // SyntaxError nothing caught, and the editor showed "we could not finish that just now"
    // for a 500.
    const reply = await model.strong.complete({
        job: 'edit',
        prefer: 'groq',
        system: contained.system,
        user: render(tpl.user, {
            instruction,
            sectionKey: section.type,
            variant: section.variant,
            content: contained.values.content,
        }),
        schema: editProposalSchema,
    });

    // A schema makes prose unlikely, not impossible: json_schema degrades to json_object on
    // a model that will not take it, and a reply can still be cut off mid-object. Either way
    // the person deserves "the AI did not answer in a form we could use", not a 500.
    let raw: unknown;
    try {
        raw = JSON.parse(stripFences(reply.text));
    } catch {
        throw new Error(
            `proposeEdit: the model did not return JSON (${reply.text.trim().slice(0, 120)})`,
        );
    }

    const parsed = editProposal.safeParse(raw);
    if (!parsed.success) throw new Error(`proposeEdit: ${parsed.error.message}`);

    const clean = sanitiseDeep(parsed.data.changes);

    const patch: PatchOp[] = Object.entries(clean).map(([key, value]) => ({
        op: key in section.props ? 'replace' : 'add',
        path: `/props/${key}`,
        value,
    }));

    return {
        data: {
            targetSectionId: section.id,
            patch,
            // FR-066: sanitise before it is *rendered*, not only before it is
            // applied — a proposal the user rejects is still shown to them.
            explanation: sanitise(parsed.data.explanation).clean,
            applied: false,
        },
        usage: { ...reply, promptVersion: `${tpl.id}.${tpl.version}` },
    };
}