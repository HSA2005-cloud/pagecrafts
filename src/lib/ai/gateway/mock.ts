import type { CompleteReply, CompleteRequest } from './provider';
import { aiConfig } from '../config';
import { SECTION_CONTRACTS } from '../sections/contracts';
import type { Field, SectionKey } from '@/lib/contracts';

type Mode = 'ok' | 'error' | 'garbage';

// ── classification fixtures ────────────────────────────────────────────────

const CLASSIFICATIONS: Record<string, unknown> = {
    'photography studio': {
        category: 'portfolio', vertical: 'photography',
        tone: 'minimal', palette: 'dark',
        sections: ['hero', 'gallery', 'about', 'contact'],
    },
    'dental clinic': {
        category: 'other', vertical: 'dental-clinic',
        tone: 'formal', palette: 'light',
        sections: ['hero', 'services', 'team', 'faq', 'contact'],
    },
    bakery: {
        category: 'restaurant', vertical: 'bakery',
        tone: 'warm', palette: 'light',
        sections: ['hero', 'menu', 'gallery', 'contact'],
    },
};

const DEFAULT_CLASSIFICATION = {
    category: 'other', vertical: 'general-business',
    tone: 'minimal', palette: 'light',
    sections: ['hero', 'about', 'contact'],
};

function matchClassification(text: string): unknown {
    const lower = text.toLowerCase();
    const key = Object.keys(CLASSIFICATIONS).find((k) => lower.includes(k));
    return key ? CLASSIFICATIONS[key] : DEFAULT_CLASSIFICATION;
}

// ── profile fixture ────────────────────────────────────────────────────────

const PROFILE = {
    label: 'Mock business',
    aliases: ['mock'],
    artDirection: {
        themeId: 'clinical-blue',
        motionId: 'whisper',
        radiusId: 'soft',
        spacingId: 'default',
        imageryId: 'bright-clean',
    },
    recipe: [
        { type: 'hero', required: true, note: 'welcome and a clear action' },
        { type: 'services', required: true, note: 'what this business offers' },
        { type: 'team', required: false, note: 'who works here' },
        { type: 'faq', required: false, note: 'common questions' },
        { type: 'contact', required: true, note: 'how to get in touch' },
        { type: 'footer', required: true },
    ],
    vocabulary: { customer: 'customer', purchase: 'booking' },
    imageQueries: ['office interior', 'team at work', 'reception desk'],
};

// ── plan fixture ───────────────────────────────────────────────────────────

const PLAN = {
    sections: [
        { type: 'hero', variant: 'split-image', brief: 'welcome the visitor' },
        { type: 'services', variant: 'cards', brief: 'what we offer' },
        { type: 'team', variant: 'grid', brief: 'who works here' },
        { type: 'faq', variant: 'accordion', brief: 'common questions' },
        { type: 'contact', variant: 'split-map', brief: 'how to reach us' },
        { type: 'footer', variant: 'simple', brief: 'closing line' },
    ],
};

// ── fill fixtures, derived from the section contracts ──────────────────────

function sampleField(f: Field): unknown {
    switch (f.type) {
        case 'text':
            return `Sample ${f.label.toLowerCase()}`.slice(0, f.maxLength ?? 120);
        case 'richtext':
            return `Sample ${f.label.toLowerCase()} written by the mock gateway.`;
        case 'image':
            return { query: 'office interior', alt: 'Office interior' };
        case 'select':
            return f.options?.[0] ?? 'default';
        case 'list':
            return [sampleFields(f.itemSchema ?? [])];
        case 'color':
            return undefined;
        default:
            return undefined;
    }
}

function sampleFields(fields: Field[]): Record<string, unknown> {
    return Object.fromEntries(
        fields.filter((f) => f.type !== 'color').map((f) => [f.key, sampleField(f)]),
    );
}

function fillFixtureFor(prompt: string): unknown {
    const key = prompt.match(/Section:\s*(\S+)/)?.[1] as SectionKey | undefined;
    const contract = key ? SECTION_CONTRACTS[key] : undefined;
    if (!contract) throw new Error(`MockGateway: no contract for section "${key}".`);
    return sampleFields(contract.fields);
}

// ── the gateway ────────────────────────────────────────────────────────────

export class MockGateway {
    constructor(private readonly mode: Mode = 'ok') { }

    private reply(text: string): CompleteReply {
        // The mock stands in for the whole chain; label it as the configured primary.
        return {
            provider: aiConfig().provider,
            text, model: 'mock', inputTokens: 12, outputTokens: 24, latencyMs: 3,
        };
    }

    async complete(req: CompleteRequest): Promise<CompleteReply> {
        if (this.mode === 'error') throw new Error('mock provider unreachable');
        if (this.mode === 'garbage') return this.reply('sorry, I cannot help with that');

        const p = req.user;

        if (p.includes('Business type:')) return this.reply(JSON.stringify(PROFILE));
        if (p.includes('Recipe for this business:')) return this.reply(JSON.stringify(PLAN));
        if (p.includes('Fields to fill:')) return this.reply(JSON.stringify(fillFixtureFor(p)));
        if (p.includes('Description:') && (p.includes('Vertical hint:') || req.job === 'compose')) {
            return this.reply(JSON.stringify({
                title: 'Mock Custom Site',
                description: 'A working mock custom site',
                files: [
                    {
                        path: 'index.html',
                        content: '<!DOCTYPE html><html><head><title>Mock</title><link rel="stylesheet" href="styles.css"/></head><body><h1>Mock Custom Site</h1><script src="app.js"></script></body></html>',
                    },
                    { path: 'styles.css', content: 'body{font-family:sans-serif}' },
                    { path: 'app.js', content: 'console.log("ok")' },
                ],
            }));
        }

        if (p.includes('Rewrite the words on this page')) {
            return this.reply(JSON.stringify({
                explanation: 'Updated the words to match the request.',
                values: { hero: { headline: 'A clearer headline' } },
            }));
        }

        // Clarity gate — refuse gibberish so generate does not invent a site.
        if (typeof req.system === 'string' && /clear enough to build/i.test(req.system)) {
            const lower = p.toLowerCase();
            const junk =
                /asdf|qwer|zxcv|xxxxxx|aaaaaa|gibberish|lorem ipsum/.test(lower) ||
                lower.replace(/[^a-z]/g, '').length < 8;
            return this.reply(
                JSON.stringify(
                    junk
                        ? { usable: false, confidence: 'low' }
                        : { usable: true, confidence: 'high' },
                ),
            );
        }

        // Gemini expand stage — turn a short form brief into a detailed build prompt.
        if (typeof req.system === 'string' && /detailed build brief/i.test(req.system)) {
            const seed = p.replace(/<\/?description>/g, '').trim() || 'a local business website';
            return this.reply(
                JSON.stringify({
                    expandedPrompt:
                        `${seed} Build a complete marketing website with a clear hero, ` +
                        `services, about, and contact sections. Keep every fact the person gave. ` +
                        `Write concrete section copy for a visitor who wants to book or buy.`,
                }),
            );
        }

        return this.reply(JSON.stringify(matchClassification(p)));
    }
}