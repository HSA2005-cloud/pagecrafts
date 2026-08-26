import { model, GatewayError } from '../gateway';
import { aiConfig } from '../config';
import { loadTemplate, render } from '../harness/templates';
import { stripFences } from '../sanitise';
import { contain } from '../containment/envelope';
import type { AiResult, FileMap, IntentAttributes, Composition } from '@/lib/contracts';
import { SCHEMA_VERSION } from '@/lib/contracts';
import { composeSiteSchema } from '../gateway/response-schemas';

const MAX_FILES = 12;
const MAX_FILE_CHARS = 80_000;
const ALLOWED_EXT = /\.(html?|css|js|json|svg|txt|md)$/i;
const SAFE_PATH = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,120}$/;

export interface CustomSiteResult {
    title: string;
    description: string;
    files: FileMap;
    composition: Composition;
}

function sanitisePath(raw: string): string | null {
    const path = raw.trim().replace(/^\/+/, '').replace(/\\/g, '/');
    if (!path || path.includes('..') || !SAFE_PATH.test(path) || !ALLOWED_EXT.test(path)) {
        return null;
    }
    return path;
}

function sanitiseContent(content: string): string {
    // Block remote script hosts other than fonts; keep inline JS for apps.
    return content
        .replace(/<script\b[^>]*\bsrc\s*=\s*["'](?!https:\/\/fonts\.googleapis\.com)[^"']+["'][^>]*>\s*<\/script>/gi, '')
        .slice(0, MAX_FILE_CHARS);
}

function asFiles(raw: unknown): FileMap {
    if (!raw || typeof raw !== 'object') return {};
    const list = Array.isArray((raw as { files?: unknown }).files)
        ? (raw as { files: unknown[] }).files
        : [];
    const out: FileMap = {};
    for (const entry of list.slice(0, MAX_FILES)) {
        if (!entry || typeof entry !== 'object') continue;
        const path = sanitisePath(String((entry as { path?: unknown }).path ?? ''));
        const content = (entry as { content?: unknown }).content;
        if (!path || typeof content !== 'string' || !content.trim()) continue;
        out[path] = sanitiseContent(content);
    }
    return out;
}

function ensureIndex(files: FileMap, title: string, description: string): FileMap {
    if (files['index.html']) return files;
    return {
        ...files,
        'index.html': `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeText(title)}</title>
<link rel="stylesheet" href="styles.css"/></head>
<body>
<main><h1>${escapeText(title)}</h1><p>${escapeText(description)}</p></main>
<script src="app.js"></script>
</body></html>`,
        'styles.css': files['styles.css'] ?? 'body{font-family:system-ui,sans-serif;margin:2rem;line-height:1.5}',
        'app.js': files['app.js'] ?? '',
    };
}

function escapeText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function stubComposition(
    title: string,
    description: string,
    vertical: string,
): Composition {
    return {
        schemaVersion: SCHEMA_VERSION,
        vertical,
        artDirection: {
            themeId: 'sunlit-craft',
            motionId: 'calm',
            radiusId: 'soft',
            spacingId: 'default',
            imageryId: 'warm-natural',
        },
        meta: { title, description, lang: 'en' },
        sections: [
            {
                id: 's_01',
                type: 'hero',
                variant: 'centred',
                brief: 'custom site',
                visible: true,
                locked: false,
                source: 'ai',
                props: {
                    heading: title,
                    subheading: description,
                    ctaLabel: 'Get started',
                    ctaHref: '#',
                },
            },
            {
                id: 's_02',
                type: 'footer',
                variant: 'simple',
                brief: 'footer',
                visible: true,
                locked: false,
                source: 'ai',
                props: { blurb: description.slice(0, 120) },
            },
        ],
    };
}

/**
 * Freeform multi-file site from the prompt — used when the recipe pipeline
 * cannot express what they asked for (cart, waiter, dashboard, …).
 */
export async function composeCustomSite(
    prompt: string,
    intent: IntentAttributes,
): Promise<AiResult<CustomSiteResult>> {
    const tpl = loadTemplate(aiConfig().prompts.compose);
    const contained = contain(render(tpl.system), { prompt });

    const reply = await model.strong.complete({
        job: 'compose',
        prefer: 'groq',
        system: contained.system,
        user: render(tpl.user, {
            prompt: contained.values.prompt,
            vertical: intent.vertical,
            tone: intent.tone,
        }),
        schema: composeSiteSchema,
    });

    let raw: unknown;
    try {
        raw = JSON.parse(stripFences(reply.text));
    } catch {
        throw new GatewayError('generation_failed', 'compose: model output was not JSON', false, {
            raw: reply.text,
            usage: { ...reply, promptVersion: `${tpl.id}.${tpl.version}` },
        });
    }

    const title = typeof (raw as { title?: unknown }).title === 'string'
        && (raw as { title: string }).title.trim()
        ? (raw as { title: string }).title.trim().slice(0, 80)
        : intent.vertical.replace(/-/g, ' ');
    const description = typeof (raw as { description?: unknown }).description === 'string'
        ? (raw as { description: string }).description.trim().slice(0, 240)
        : prompt.slice(0, 160);

    const files = ensureIndex(asFiles(raw), title, description);
    if (Object.keys(files).length === 0) {
        throw new GatewayError('generation_failed', 'compose: model returned no files', false, {
            raw: reply.text,
            usage: { ...reply, promptVersion: `${tpl.id}.${tpl.version}` },
        });
    }

    const usage = { ...reply, promptVersion: `${tpl.id}.${tpl.version}` };
    return {
        data: {
            title,
            description,
            files,
            composition: stubComposition(title, description, intent.vertical),
        },
        usage,
    };
}
