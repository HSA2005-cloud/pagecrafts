import { model } from './gateway';
import { loadTemplate, render } from './harness/templates';
import { stripFences } from './sanitise';
import { contain } from './containment/envelope';
import { MAX_CLASSIFY_CHARS } from '@/lib/contracts';
import {
    promptLooksClear,
    UNCLEAR_BRIEF_MESSAGE,
} from '@/lib/ai/generate/clarity';
import { Type, type Schema } from '@google/genai';

const claritySchema: Schema = {
    type: Type.OBJECT,
    properties: {
        usable: { type: Type.BOOLEAN },
        confidence: { type: Type.STRING, enum: ['high', 'low'] },
    },
    required: ['usable', 'confidence'],
    propertyOrdering: ['usable', 'confidence'],
};

export type ClarityVerdict = {
    usable: boolean;
    confidence: 'high' | 'low';
    message: string;
};

/**
 * Heuristic first (free). If that passes, ask the fast model whether it is
 * confident enough to build. When the model is down, keep the heuristic pass
 * so a real brief is not blocked by an outage.
 */
export async function assessPromptClarity(prompt: string): Promise<ClarityVerdict> {
    const input = prompt.trim().slice(0, MAX_CLASSIFY_CHARS);

    if (!promptLooksClear(input)) {
        return {
            usable: false,
            confidence: 'low',
            message: UNCLEAR_BRIEF_MESSAGE,
        };
    }

    try {
        const tpl = loadTemplate('clarity.v1');
        const contained = contain(render(tpl.system), { text: input });
        const reply = await model.fast.complete({
            job: 'classify',
            system: contained.system,
            user: render(tpl.user, { text: contained.values.text }),
            schema: claritySchema,
        });

        const raw = JSON.parse(stripFences(reply.text)) as {
            usable?: unknown;
            confidence?: unknown;
        };

        const usable = raw.usable === true;
        const confidence = raw.confidence === 'high' ? 'high' : 'low';

        if (!usable || confidence !== 'high') {
            return {
                usable: false,
                confidence: 'low',
                message: UNCLEAR_BRIEF_MESSAGE,
            };
        }

        return { usable: true, confidence: 'high', message: '' };
    } catch (err) {
        console.warn(
            `clarity: fell back to heuristic — ${err instanceof Error ? err.message : err}`,
        );
        // Heuristic already passed; do not block a clear brief on a model blip.
        return { usable: true, confidence: 'high', message: '' };
    }
}
