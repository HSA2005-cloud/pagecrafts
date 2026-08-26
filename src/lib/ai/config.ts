import { z } from 'zod';

export type AiOperation = 'classify' | 'generate' | 'edit' | 'compose';

/** Every provider we can talk to; chain order is separate (see `order`). */
export type Provider = 'gemini' | 'groq' | 'cerebras';

const KNOWN_PROVIDERS: readonly Provider[] = ['gemini', 'groq', 'cerebras'] as const;

const envSchema = z.object({
    // Tried left to right; a provider with no key is skipped. Cerebras is
    // supported in code but omitted: unfunded, and Gate 1 was not recorded
    // for it (docs/ai/GATE1_GROQ_TRAINING.md). Do not add it back without
    // a terms re-read.
    AI_PROVIDER_ORDER: z.string().default('groq'),

    // Per-operation output ceilings (FR-103). Shared across providers; sent as max_tokens.
    AI_OUTPUT_CLASSIFY_TOKENS: z.coerce.number().int().positive().default(1_024),
    AI_OUTPUT_GENERATE_TOKENS: z.coerce.number().int().positive().default(4_000),
    AI_OUTPUT_EDIT_TOKENS: z.coerce.number().int().positive().default(2_000),
    AI_OUTPUT_COMPOSE_TOKENS: z.coerce.number().int().positive().default(6_000),

    // Sampling, per operation (D12). Deliberately optional: left unset nothing is
    // sent and the provider's own default applies, which is what every
    // measurement up to D11 was taken under. Setting one changes generation
    // output, so the sweep sets it explicitly and records the winner here.
    AI_TEMPERATURE_CLASSIFY: z.coerce.number().min(0).max(2).optional(),
    AI_TEMPERATURE_GENERATE: z.coerce.number().min(0).max(2).optional(),
    AI_TEMPERATURE_EDIT: z.coerce.number().min(0).max(2).optional(),
    AI_TEMPERATURE_COMPOSE: z.coerce.number().min(0).max(2).optional(),
    AI_TOP_P_CLASSIFY: z.coerce.number().min(0).max(1).optional(),
    AI_TOP_P_GENERATE: z.coerce.number().min(0).max(1).optional(),
    AI_TOP_P_EDIT: z.coerce.number().min(0).max(1).optional(),
    AI_TOP_P_COMPOSE: z.coerce.number().min(0).max(1).optional(),

    // Which prompt version each stage runs. A version number marks a decision,
    // so switching v1 → v3 is a config change with a before/after behind it,
    // not an edit to a file. Plan/fill default to v3 after unspecified had a
    // clean after-run (not a 429).
    AI_PROMPT_CLASSIFY: z.string().default('classify.v1'),
    AI_PROMPT_PROFILE: z.string().default('profile.v1'),
    AI_PROMPT_PLAN: z.string().default('plan.v3'),
    AI_PROMPT_FILL: z.string().default('fill-section.v3'),
    AI_PROMPT_EDIT: z.string().default('edit.v1'),
    AI_PROMPT_COMPOSE: z.string().default('compose-site.v1'),

    // Per-operation timeouts. Shared across providers.
    GEMINI_TIMEOUT_CLASSIFY_MS: z.coerce.number().int().positive().default(5_000),
    GEMINI_TIMEOUT_GENERATE_MS: z.coerce.number().int().positive().default(45_000),
    GEMINI_TIMEOUT_EDIT_MS: z.coerce.number().int().positive().default(30_000),
    GEMINI_TIMEOUT_COMPOSE_MS: z.coerce.number().int().positive().default(90_000),

    // ── Gemini (final fallback / Ask AI brief expand) ────────────────────────
    // Optional; the "at least one key" rule lives in the gateway builder.
    // Extra keys round-robin and rotate on rate-limit / daily quota, same as Groq.
    GEMINI_API_KEY: z.string().default(''),
    GEMINI_API_KEYS: z.string().default(''),
    GEMINI_API_KEY_2: z.string().default(''),
    GEMINI_API_KEY_3: z.string().default(''),
    GEMINI_API_KEY_4: z.string().default(''),
    GEMINI_API_KEY_5: z.string().default(''),
    GEMINI_API_KEY_6: z.string().default(''),
    GEMINI_API_KEY_7: z.string().default(''),
    GEMINI_API_KEY_8: z.string().default(''),
    GEMINI_MODEL_FAST: z.string().default('gemini-3.5-flash-lite'),
    GEMINI_MODEL_STRONG: z.string().default('gemini-3.5-flash'),
    GEMINI_RPM: z.coerce.number().int().positive().default(5),
    GEMINI_RPD: z.coerce.number().int().positive().default(20),
    GEMINI_TPM: z.coerce.number().int().min(0).default(0),
    GEMINI_TPD: z.coerce.number().int().min(0).default(0),
    GEMINI_RPD_HEADROOM_PCT: z.coerce.number().min(0).max(100).default(15),
    GEMINI_MAX_REQUEST_TOKENS: z.coerce.number().int().positive().default(8_000),
    GEMINI_PRICE_IN_PER_MTOK_CENTS: z.coerce.number().min(0).default(0),
    GEMINI_PRICE_OUT_PER_MTOK_CENTS: z.coerce.number().min(0).default(0),

    // ── Groq (first priority) ────────────────────────────────────────────────
    GROQ_API_KEY: z.string().default(''),
    // Extra orgs, round-robined with GROQ_API_KEY. Comma or whitespace
    // separated, and/or GROQ_API_KEY_2..8 so eight secrets need not share a line.
    GROQ_API_KEYS: z.string().default(''),
    GROQ_API_KEY_2: z.string().default(''),
    GROQ_API_KEY_3: z.string().default(''),
    GROQ_API_KEY_4: z.string().default(''),
    GROQ_API_KEY_5: z.string().default(''),
    GROQ_API_KEY_6: z.string().default(''),
    GROQ_API_KEY_7: z.string().default(''),
    GROQ_API_KEY_8: z.string().default(''),
    // gpt-oss-* support strict json_schema on Groq; the llama-3.x models do not.
    GROQ_MODEL_FAST: z.string().default('openai/gpt-oss-20b'),
    GROQ_MODEL_STRONG: z.string().default('openai/gpt-oss-120b'),
    GROQ_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
    // Published free-tier limits (console.groq.com/docs/rate-limits). TPD binds
    // before RPD: one full generation is ~9.4k tokens.
    GROQ_RPM: z.coerce.number().int().positive().default(30),
    GROQ_RPD: z.coerce.number().int().positive().default(1_000),
    GROQ_TPM: z.coerce.number().int().min(0).default(8_000),
    GROQ_TPD: z.coerce.number().int().min(0).default(200_000),
    GROQ_RPD_HEADROOM_PCT: z.coerce.number().min(0).max(100).default(15),
    GROQ_MAX_REQUEST_TOKENS: z.coerce.number().int().positive().default(8_000),
    GROQ_PRICE_IN_PER_MTOK_CENTS: z.coerce.number().min(0).default(0),
    GROQ_PRICE_OUT_PER_MTOK_CENTS: z.coerce.number().min(0).default(0),

    // ── Cerebras (second priority) ───────────────────────────────────────────
    CEREBRAS_API_KEY: z.string().default(''),
    CEREBRAS_MODEL_FAST: z.string().default('gpt-oss-120b'),
    CEREBRAS_MODEL_STRONG: z.string().default('gpt-oss-120b'),
    CEREBRAS_BASE_URL: z.string().default('https://api.cerebras.ai/v1'),
    CEREBRAS_RPM: z.coerce.number().int().positive().default(30),
    CEREBRAS_RPD: z.coerce.number().int().positive().default(1_000),
    CEREBRAS_TPM: z.coerce.number().int().min(0).default(0),
    CEREBRAS_TPD: z.coerce.number().int().min(0).default(0),
    CEREBRAS_RPD_HEADROOM_PCT: z.coerce.number().min(0).max(100).default(15),
    CEREBRAS_MAX_REQUEST_TOKENS: z.coerce.number().int().positive().default(8_000),
    CEREBRAS_PRICE_IN_PER_MTOK_CENTS: z.coerce.number().min(0).default(0),
    CEREBRAS_PRICE_OUT_PER_MTOK_CENTS: z.coerce.number().min(0).default(0),
});

export interface ProviderQuota {
    rpm: number;
    rpd: number;
    /** Tokens per minute / per day. 0 means "not published", so it is not enforced. */
    tpm: number;
    tpd: number;
    rpdHeadroomPct: number;
    maxRequestTokens: number;
}

export interface ProviderPricing {
    inPerMTokCents: number;
    outPerMTokCents: number;
}

export interface ProviderConfig {
    /** First key; empty means this provider is skipped. */
    apiKey: string;
    /** Every key for this provider, de-duped. Groq and Gemini round-robin these. */
    apiKeys: string[];
    models: { fast: string; strong: string };
    /** OpenAI-compatible base URL. Empty for Gemini (it uses the native SDK). */
    baseUrl: string;
    quota: ProviderQuota;
    pricing: ProviderPricing;
}

/** Undefined means "send nothing and let the provider decide". */
export interface Sampling {
    temperature?: number;
    topP?: number;
}

/** Which prompt file each stage loads, so a version switch is a config change. */
export interface PromptVersions {
    classify: string;
    profile: string;
    plan: string;
    fill: string;
    edit: string;
    compose: string;
}

export interface AiConfig {
    /** Head of the chain, derived from `order`. */
    provider: Provider;
    /** Priority, trimmed to known providers; never empty. */
    order: Provider[];
    providers: Record<Provider, ProviderConfig>;

    // Back-compat: these mirror the Gemini provider so existing callers keep working.
    apiKey: string;
    models: { fast: string; strong: string };
    quota: ProviderQuota;
    pricing: ProviderPricing;

    timeouts: Record<AiOperation, number>;
    maxOutputTokens: Record<AiOperation, number>;
    sampling: Record<AiOperation, Sampling>;
    prompts: PromptVersions;
}

/** Known providers only, de-duped. Throws if nothing valid survives. */
function parseOrder(raw: string): Provider[] {
    const seen = new Set<Provider>();
    const dropped: string[] = [];

    for (const token of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
        if ((KNOWN_PROVIDERS as readonly string[]).includes(token)) {
            seen.add(token as Provider);
        } else {
            dropped.push(token);
        }
    }

    if (dropped.length) {
        console.warn(
            `[ai config] AI_PROVIDER_ORDER: ignoring unknown provider(s) ${dropped.join(', ')}. ` +
                `Known providers: ${KNOWN_PROVIDERS.join(', ')}.`,
        );
    }

    if (seen.size === 0) {
        throw new Error(
            `AI_PROVIDER_ORDER lists no known provider (got "${raw}"). ` +
                `Set it to a comma-separated subset of: ${KNOWN_PROVIDERS.join(', ')}.`,
        );
    }

    return [...seen];
}

/** Split, trim, drop empties, de-dupe. First occurrence wins, so GROQ_API_KEY stays head. */
export function parseApiKeys(...raw: Array<string | undefined>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const chunk of raw) {
        if (!chunk) continue;
        for (const key of chunk.split(/[\s,]+/)) {
            const trimmed = key.trim();
            if (!trimmed || seen.has(trimmed)) continue;
            seen.add(trimmed);
            out.push(trimmed);
        }
    }
    return out;
}

export function loadAiConfig(env: Record<string, string | undefined> = process.env,): AiConfig {
    const parsed = envSchema.safeParse(env);

    if (!parsed.success) {
        const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
        throw new Error(`AI configuration is not usable:\n${lines.join('\n')}`);
    }

    const v = parsed.data;
    const order = parseOrder(v.AI_PROVIDER_ORDER);
    const groqKeys = parseApiKeys(
        v.GROQ_API_KEY,
        v.GROQ_API_KEYS,
        v.GROQ_API_KEY_2,
        v.GROQ_API_KEY_3,
        v.GROQ_API_KEY_4,
        v.GROQ_API_KEY_5,
        v.GROQ_API_KEY_6,
        v.GROQ_API_KEY_7,
        v.GROQ_API_KEY_8,
    );
    const geminiKeys = parseApiKeys(
        v.GEMINI_API_KEY,
        v.GEMINI_API_KEYS,
        v.GEMINI_API_KEY_2,
        v.GEMINI_API_KEY_3,
        v.GEMINI_API_KEY_4,
        v.GEMINI_API_KEY_5,
        v.GEMINI_API_KEY_6,
        v.GEMINI_API_KEY_7,
        v.GEMINI_API_KEY_8,
    );

    const providers: Record<Provider, ProviderConfig> = {
        gemini: {
            apiKey: geminiKeys[0] ?? '',
            apiKeys: geminiKeys,
            models: { fast: v.GEMINI_MODEL_FAST, strong: v.GEMINI_MODEL_STRONG },
            baseUrl: '',
            quota: {
                rpm: v.GEMINI_RPM,
                rpd: v.GEMINI_RPD,
                tpm: v.GEMINI_TPM,
                tpd: v.GEMINI_TPD,
                rpdHeadroomPct: v.GEMINI_RPD_HEADROOM_PCT,
                maxRequestTokens: v.GEMINI_MAX_REQUEST_TOKENS,
            },
            pricing: {
                inPerMTokCents: v.GEMINI_PRICE_IN_PER_MTOK_CENTS,
                outPerMTokCents: v.GEMINI_PRICE_OUT_PER_MTOK_CENTS,
            },
        },
        groq: {
            apiKey: groqKeys[0] ?? '',
            apiKeys: groqKeys,
            models: { fast: v.GROQ_MODEL_FAST, strong: v.GROQ_MODEL_STRONG },
            baseUrl: v.GROQ_BASE_URL,
            quota: {
                rpm: v.GROQ_RPM,
                rpd: v.GROQ_RPD,
                tpm: v.GROQ_TPM,
                tpd: v.GROQ_TPD,
                rpdHeadroomPct: v.GROQ_RPD_HEADROOM_PCT,
                maxRequestTokens: v.GROQ_MAX_REQUEST_TOKENS,
            },
            pricing: {
                inPerMTokCents: v.GROQ_PRICE_IN_PER_MTOK_CENTS,
                outPerMTokCents: v.GROQ_PRICE_OUT_PER_MTOK_CENTS,
            },
        },
        cerebras: {
            apiKey: v.CEREBRAS_API_KEY,
            apiKeys: parseApiKeys(v.CEREBRAS_API_KEY),
            models: { fast: v.CEREBRAS_MODEL_FAST, strong: v.CEREBRAS_MODEL_STRONG },
            baseUrl: v.CEREBRAS_BASE_URL,
            quota: {
                rpm: v.CEREBRAS_RPM,
                rpd: v.CEREBRAS_RPD,
                tpm: v.CEREBRAS_TPM,
                tpd: v.CEREBRAS_TPD,
                rpdHeadroomPct: v.CEREBRAS_RPD_HEADROOM_PCT,
                maxRequestTokens: v.CEREBRAS_MAX_REQUEST_TOKENS,
            },
            pricing: {
                inPerMTokCents: v.CEREBRAS_PRICE_IN_PER_MTOK_CENTS,
                outPerMTokCents: v.CEREBRAS_PRICE_OUT_PER_MTOK_CENTS,
            },
        },
    };

    const active = providers[order[0]];

    return {
        provider: order[0],
        order,
        providers,
        apiKey: active.apiKey,
        models: active.models,
        quota: active.quota,
        pricing: active.pricing,
        timeouts: {
            classify: v.GEMINI_TIMEOUT_CLASSIFY_MS,
            generate: v.GEMINI_TIMEOUT_GENERATE_MS,
            edit: v.GEMINI_TIMEOUT_EDIT_MS,
            compose: v.GEMINI_TIMEOUT_COMPOSE_MS,
        },
        maxOutputTokens: {
            classify: v.AI_OUTPUT_CLASSIFY_TOKENS,
            generate: v.AI_OUTPUT_GENERATE_TOKENS,
            edit: v.AI_OUTPUT_EDIT_TOKENS,
            compose: v.AI_OUTPUT_COMPOSE_TOKENS,
        },
        sampling: {
            classify: sampling(v.AI_TEMPERATURE_CLASSIFY, v.AI_TOP_P_CLASSIFY),
            generate: sampling(v.AI_TEMPERATURE_GENERATE, v.AI_TOP_P_GENERATE),
            edit: sampling(v.AI_TEMPERATURE_EDIT, v.AI_TOP_P_EDIT),
            compose: sampling(v.AI_TEMPERATURE_COMPOSE, v.AI_TOP_P_COMPOSE),
        },
        prompts: {
            classify: v.AI_PROMPT_CLASSIFY,
            profile: v.AI_PROMPT_PROFILE,
            plan: v.AI_PROMPT_PLAN,
            fill: v.AI_PROMPT_FILL,
            edit: v.AI_PROMPT_EDIT,
            compose: v.AI_PROMPT_COMPOSE,
        },
    };
}

/** Omits a key entirely when unset, so `{...sampling}` sends nothing. */
function sampling(temperature?: number, topP?: number): Sampling {
    return {
        ...(temperature === undefined ? {} : { temperature }),
        ...(topP === undefined ? {} : { topP }),
    };
}

let cached: AiConfig | null = null;

export function aiConfig(): AiConfig {
    return (cached ??= loadAiConfig());
}

/**
 * Drops the memoised config so the next call re-reads the environment.
 *
 * For the D12 sweep and for tests, which change one setting and need it to take
 * effect. Callers that also hold a gateway must rebuild it — `setGateway(null)`
 * — since the chain is built from the config it was created with.
 */
export function resetAiConfig(): void {
    cached = null;
}
