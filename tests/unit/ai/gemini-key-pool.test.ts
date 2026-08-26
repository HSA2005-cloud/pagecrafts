import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setBackoffClock } from '@/lib/ai/gateway/backoff';
import type { ProviderConfig } from '@/lib/ai/config';
import {
    GeminiGateway,
    resetGeminiKeyPool,
    type CompleteRequest,
} from '@/lib/ai/gateway/provider';

const generateContent = vi.fn();
const constructedKeys: string[] = [];

vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        models = { generateContent };
        constructor(opts: { apiKey: string }) {
            constructedKeys.push(opts.apiKey);
        }
    },
}));

function cfg(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
    const apiKey = overrides.apiKey ?? 'g1';
    return {
        models: { fast: 'fast-model', strong: 'strong-model' },
        baseUrl: '',
        quota: {
            rpm: 5,
            rpd: 20,
            tpm: 0,
            tpd: 0,
            rpdHeadroomPct: 15,
            maxRequestTokens: 8000,
        },
        pricing: { inPerMTokCents: 0, outPerMTokCents: 0 },
        ...overrides,
        apiKey,
        apiKeys: overrides.apiKeys ?? (apiKey ? [apiKey] : []),
    };
}

function req(): CompleteRequest {
    return { tier: 'strong', job: 'generate', user: 'expand this brief' };
}

function okReply() {
    return {
        text: '{"expandedPrompt":"ok"}',
        usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3 },
    };
}

beforeEach(() => {
    resetGeminiKeyPool();
    constructedKeys.length = 0;
    generateContent.mockReset();
    generateContent.mockResolvedValue(okReply());
});

afterEach(() => {
    setBackoffClock(null);
    vi.restoreAllMocks();
});

describe('GeminiGateway key pool', () => {
    it('is configured when only GEMINI_API_KEYS-style apiKeys are set', () => {
        const gw = new GeminiGateway(cfg({ apiKey: 'a', apiKeys: ['a', 'b', 'c', 'd'] }));
        expect(gw.configured).toBe(true);
    });

    it('round-robins across Gemini keys', async () => {
        const keys = ['g1', 'g2', 'g3', 'g4'];
        const gw = new GeminiGateway(cfg({ apiKey: keys[0], apiKeys: keys }));

        await gw.complete(req());
        await gw.complete(req());
        await gw.complete(req());
        await gw.complete(req());
        await gw.complete(req());

        // Clients are cached per key; construction order is first-use order.
        expect(constructedKeys).toEqual(['g1', 'g2', 'g3', 'g4']);
        expect(generateContent).toHaveBeenCalledTimes(5);
    });

    it('rotates to the next Gemini key on rate-limit without waiting', async () => {
        const sleep = vi.fn(async () => {});
        setBackoffClock({ sleep, jitter: () => 0 });
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        generateContent
            .mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED rate limit'))
            .mockResolvedValueOnce(okReply());

        const reply = await new GeminiGateway(
            cfg({ apiKeys: ['spent-rpm', 'live'] }),
        ).complete(req());

        expect(reply.provider).toBe('gemini');
        expect(constructedKeys).toEqual(['spent-rpm', 'live']);
        expect(generateContent).toHaveBeenCalledTimes(2);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('skips a Gemini key that hit a daily/free-tier quota', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        generateContent
            .mockRejectedValueOnce(
                new Error('You exceeded your current quota. GenerateRequestsPerDayPerProjectPerModel'),
            )
            .mockResolvedValueOnce(okReply())
            .mockResolvedValueOnce(okReply());

        const gw = new GeminiGateway(cfg({ apiKeys: ['spent', 'live'] }));
        await gw.complete(req());
        await gw.complete(req());

        // First call: spent fails (daily), live succeeds. Second call: round-robin
        // would hit spent again, but daily-exhausted skips it → live.
        expect(constructedKeys).toEqual(['spent', 'live']);
        expect(generateContent).toHaveBeenCalledTimes(3);
    });

    it('throws when no Gemini key is configured', async () => {
        await expect(
            new GeminiGateway(cfg({ apiKey: '', apiKeys: [] })).complete(req()),
        ).rejects.toThrow(/no API key/);
    });
});
