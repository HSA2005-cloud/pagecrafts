import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadAiConfig } from '@/lib/ai/config';

const base = { GEMINI_API_KEY: 'test-key' };

afterEach(() => vi.restoreAllMocks());

describe('loadAiConfig', () => {
    it('loads with no keys at all — the "at least one key" rule lives in the builder', () => {
        expect(() => loadAiConfig({})).not.toThrow();
        expect(loadAiConfig({}).providers.gemini.apiKey).toBe('');
    });

    it('falls back to the measured free-tier limits', () => {
        const cfg = loadAiConfig(base);
        // Back-compat quota mirrors the active provider (groq by default).
        expect(cfg.quota.rpd).toBe(1_000);
        expect(cfg.quota.rpm).toBe(30);
        // Gemini's own limits are still accessible via providers.
        expect(cfg.providers.gemini.quota.rpd).toBe(20);
        expect(cfg.providers.gemini.quota.rpm).toBe(5);
    });

    it('reads limits from the environment as numbers', () => {
        const cfg = loadAiConfig({ ...base, GEMINI_RPD: '1500' });
        expect(cfg.providers.gemini.quota.rpd).toBe(1500);
        // Back-compat mirrors active provider (groq), not Gemini.
        const cfg2 = loadAiConfig({ ...base, GROQ_RPD: '2000' });
        expect(cfg2.quota.rpd).toBe(2000);
    });

    it('rejects a limit that is not a number', () => {
        expect(() => loadAiConfig({ ...base, GEMINI_RPM: 'lots' })).toThrow();
    });

    it('splits models into fast and strong tiers', () => {
        const cfg = loadAiConfig(base);
        // Back-compat mirrors the active provider (groq by default).
        expect(cfg.models.fast).toBe(cfg.providers[cfg.provider].models.fast);
        expect(cfg.models.strong).toBe(cfg.providers[cfg.provider].models.strong);
        expect(cfg.models.fast).not.toBe(cfg.models.strong);
    });

    it('defaults the Gemini models to the 3.5 family', () => {
        const cfg = loadAiConfig(base);
        expect(cfg.providers.gemini.models.fast).toBe('gemini-3.5-flash-lite');
        expect(cfg.providers.gemini.models.strong).toBe('gemini-3.5-flash');
    });

    it('defaults the provider order to groq only', () => {
        expect(loadAiConfig(base).order).toEqual(['groq']);
        expect(loadAiConfig(base).provider).toBe('groq');
    });

    // Cerebras stays configurable — it is out of the default chain, not removed.
    // Gate 1 was recorded for Groq only; do not put cerebras in production
    // order without a terms re-read (docs/ai/GATE1_GROQ_TRAINING.md).
    it('still supports cerebras when it is named in the order', () => {
        const cfg = loadAiConfig({ ...base, AI_PROVIDER_ORDER: 'groq,cerebras,gemini' });
        expect(cfg.order).toEqual(['groq', 'cerebras', 'gemini']);
    });

    it('parses a custom order, warning on unknown tokens and de-duping', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const cfg = loadAiConfig({ ...base, AI_PROVIDER_ORDER: 'gemini, nonsense, groq, groq' });
        expect(cfg.order).toEqual(['gemini', 'groq']);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('nonsense'));
    });

    // C4 — a typo like `grok,cerbras` must fail loudly, not silently become gemini-only.
    it('throws when the order lists nothing known', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(() => loadAiConfig({ ...base, AI_PROVIDER_ORDER: 'grok,cerbras' })).toThrow(/no known provider/);
    });

    it('leaves groq and cerebras keys empty until provided', () => {
        const cfg = loadAiConfig(base);
        expect(cfg.providers.groq.apiKey).toBe('');
        expect(cfg.providers.groq.apiKeys).toEqual([]);
        expect(cfg.providers.cerebras.apiKey).toBe('');
        expect(cfg.providers.gemini.apiKey).toBe('test-key');
    });

    it('reads extra Groq keys and de-dupes, keeping GROQ_API_KEY first', () => {
        const cfg = loadAiConfig({
            GROQ_API_KEY: 'k1',
            GROQ_API_KEYS: 'k2, k1, k3',
            GROQ_API_KEY_4: 'k4',
            GROQ_API_KEY_5: 'k5',
            GROQ_API_KEY_6: 'k6',
            GROQ_API_KEY_7: 'k7',
            GROQ_API_KEY_8: 'k8',
        });
        expect(cfg.providers.groq.apiKeys).toEqual(['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8']);
        expect(cfg.providers.groq.apiKey).toBe('k1');
    });

    it('reads extra Gemini keys and de-dupes, keeping GEMINI_API_KEY first', () => {
        const cfg = loadAiConfig({
            GEMINI_API_KEY: 'g1',
            GEMINI_API_KEYS: 'g2, g1, g3',
            GEMINI_API_KEY_4: 'g4',
        });
        expect(cfg.providers.gemini.apiKeys).toEqual(['g1', 'g2', 'g3', 'g4']);
        expect(cfg.providers.gemini.apiKey).toBe('g1');
    });

    it('accepts GEMINI_API_KEYS alone', () => {
        const cfg = loadAiConfig({ GEMINI_API_KEYS: 'a b c d' });
        expect(cfg.providers.gemini.apiKeys).toEqual(['a', 'b', 'c', 'd']);
        expect(cfg.providers.gemini.apiKey).toBe('a');
    });

    it('accepts GROQ_API_KEYS alone', () => {
        const cfg = loadAiConfig({ GROQ_API_KEYS: 'a b c' });
        expect(cfg.providers.groq.apiKeys).toEqual(['a', 'b', 'c']);
        expect(cfg.providers.groq.apiKey).toBe('a');
    });

    it('reads per-provider models and base urls', () => {
        const cfg = loadAiConfig({
            ...base,
            GROQ_API_KEY: 'g',
            GROQ_MODEL_STRONG: 'custom-groq-70b',
            CEREBRAS_BASE_URL: 'https://example.test/v1',
        });
        expect(cfg.providers.groq.models.strong).toBe('custom-groq-70b');
        expect(cfg.providers.cerebras.baseUrl).toBe('https://example.test/v1');
    });

    // B4 — quota and pricing are per provider, not one shared Gemini block.
    it('keeps quota and pricing per provider', () => {
        const cfg = loadAiConfig({ ...base, GROQ_PRICE_IN_PER_MTOK_CENTS: '7', GROQ_MAX_REQUEST_TOKENS: '5000' });
        expect(cfg.providers.groq.pricing.inPerMTokCents).toBe(7);
        expect(cfg.providers.groq.quota.maxRequestTokens).toBe(5000);
        // Gemini's own numbers are untouched by Groq's.
        expect(cfg.providers.gemini.pricing.inPerMTokCents).toBe(0);
    });
});
