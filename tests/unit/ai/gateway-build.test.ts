import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildGateway, chainFor } from '@/lib/ai/gateway';
import { FallbackGateway } from '@/lib/ai/gateway/fallback';
import { loadAiConfig } from '@/lib/ai/config';

afterEach(() => vi.restoreAllMocks());

describe('buildGateway / chainFor', () => {
    // These asserted that one provider is handed back unwrapped. It is wrapped now, and
    // deliberately: a stage can ask for a provider by name with `prefer`, and the wrapper is
    // what routes to it — including a provider outside the configured order. The chain still
    // has to be exactly the one provider that has a key, which is what these were guarding.
    it('D1: only GROQ_API_KEY set — the chain is groq alone', () => {
        const cfg = loadAiConfig({ GROQ_API_KEY: 'g' });
        expect(chainFor(cfg).map((g) => g.name)).toEqual(['groq']);
        expect(buildGateway(cfg)).toBeInstanceOf(FallbackGateway);
    });

    it('D1: only GROQ_API_KEYS set — groq is still configured', () => {
        const cfg = loadAiConfig({ GROQ_API_KEYS: 'g1,g2' });
        expect(chainFor(cfg).map((g) => g.name)).toEqual(['groq']);
        expect(buildGateway(cfg)).toBeInstanceOf(FallbackGateway);
    });

    it('wraps two configured providers in a FallbackGateway, in order', () => {
        const cfg = loadAiConfig({
            AI_PROVIDER_ORDER: 'groq,gemini',
            GROQ_API_KEY: 'g',
            GEMINI_API_KEY: 'x',
        });
        expect(chainFor(cfg).map((g) => g.name)).toEqual(['groq', 'gemini']);
        expect(buildGateway(cfg)).toBeInstanceOf(FallbackGateway);
    });

    it('D2: no key at all — build throws "set at least one"', () => {
        expect(() => buildGateway(loadAiConfig({}))).toThrow(/at least one/i);
    });

    it('skips a provider that has no key even if it is listed in the order', () => {
        const cfg = loadAiConfig({ AI_PROVIDER_ORDER: 'groq,cerebras', CEREBRAS_API_KEY: 'c' });
        expect(chainFor(cfg).map((g) => g.name)).toEqual(['cerebras']);
    });

    it('leaves gemini and cerebras out of the chain unless the order names them', () => {
        const cfg = loadAiConfig({ GROQ_API_KEY: 'g', CEREBRAS_API_KEY: 'c', GEMINI_API_KEY: 'x' });
        expect(chainFor(cfg).map((g) => g.name)).toEqual(['groq']);
    });
});
