import { Type, type Schema } from '@google/genai';

import { model } from '../gateway';
import { loadTemplate, render } from '../harness/templates';
import { stripFences } from '../sanitise';
import { contain } from '../containment/envelope';
import { MAX_CLASSIFY_CHARS, type AiResult, type Usage } from '@/lib/contracts';

/** Cap on the expanded brief passed into classify / plan / fill / compose. */
export const MAX_EXPAND_CHARS = 4_000;

const NO_USAGE: Usage = { model: 'none', inputTokens: 0, outputTokens: 0, latencyMs: 0 };

const expandSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        expandedPrompt: { type: Type.STRING },
    },
    required: ['expandedPrompt'],
    propertyOrdering: ['expandedPrompt'],
};

function clip(text: string): string {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed.length <= MAX_EXPAND_CHARS) return trimmed;
    return `${trimmed.slice(0, MAX_EXPAND_CHARS - 1).trimEnd()}…`;
}

/**
 * Gemini expands the short form brief into a detailed build prompt; Groq (or the
 * rest of the chain) then builds from that. Soft-fails to the original brief when
 * Gemini is missing or the call fails — generation still runs.
 */
export async function expandBrief(
    prompt: string,
): Promise<AiResult<{ expandedPrompt: string; expanded: boolean }>> {
    const input = prompt.trim().slice(0, MAX_CLASSIFY_CHARS);
    if (!input) {
        return {
            data: { expandedPrompt: '', expanded: false },
            usage: NO_USAGE,
        };
    }

    try {
        const tpl = loadTemplate('expand-brief.v1');
        const contained = contain(render(tpl.system), { text: input });
        const reply = await model.strong.complete({
            job: 'generate',
            prefer: 'gemini',
            system: contained.system,
            user: render(tpl.user, { text: contained.values.text }),
            schema: expandSchema,
        });

        const usage: Usage = { ...reply, promptVersion: `${tpl.id}.${tpl.version}` };
        const raw = JSON.parse(stripFences(reply.text)) as { expandedPrompt?: unknown };
        const expanded =
            typeof raw.expandedPrompt === 'string' ? clip(raw.expandedPrompt) : '';

        if (!expanded || expanded.length < input.length * 0.5) {
            return {
                data: { expandedPrompt: input, expanded: false },
                usage,
            };
        }

        return {
            data: { expandedPrompt: expanded, expanded: true },
            usage,
        };
    } catch (err) {
        console.warn(
            `expand-brief: fell back to original — ${err instanceof Error ? err.message : err}`,
        );
        return {
            data: { expandedPrompt: input, expanded: false },
            usage: NO_USAGE,
        };
    }
}
