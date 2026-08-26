import { GoogleGenAI, type Schema } from '@google/genai';
import { aiConfig, type Provider, type ProviderConfig } from '../config';
import type { ErrorCode } from '@/lib/contracts';
import { timeoutFor, samplingFor, type Job, type Tier } from './tiers';
import { backoffClock, delayForAttempt, isRateLimitError, MAX_RATE_LIMIT_ATTEMPTS } from './backoff';

export interface CompleteRequest {
    tier: Tier;
    job: Job;
    system?: string;
    user: string;
    schema?: Schema;
    /** An external deadline from the fallback chain; combined with the per-attempt timeout. */
    signal?: AbortSignal;
    /**
     * Prefer this provider first when it is configured — used so Gemini can expand a brief
     * while Groq still builds the site, without flipping the global provider order.
     */
    prefer?: Provider;
}

export interface CompleteReply {
    /** The provider that served this reply. */
    provider: Provider;
    /** How the shape was constrained, so a quality difference is traceable. */
    structuredOutput?: 'json_schema' | 'json_object' | 'response_schema' | 'none';
    text: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
}

export class GatewayError extends Error {
    constructor(
        readonly code: ErrorCode,
        message: string,
        readonly retryable = false,
        readonly detail?: unknown,
    ) {
        super(message);
    }
}

export interface Gateway {
    complete(req: CompleteRequest): Promise<CompleteReply>;
}

/** A gateway that reports its provider name and whether it has credentials to run. */
export interface NamedGateway extends Gateway {
    readonly name: Provider;
    /** False when the provider has no API key configured, so the chain can skip it. */
    readonly configured: boolean;
}

/** The caller's deadline combined with this attempt's own timeout. */
export function attemptSignal(job: Job, external?: AbortSignal): AbortSignal {
    const own = AbortSignal.timeout(timeoutFor(job));
    return external ? AbortSignal.any([external, own]) : own;
}

/** Round-robin cursor for Gemini keys across complete() calls in this process. */
const geminiKeyCursor = { value: 0 };

/**
 * Gemini keys that hit a daily / free-tier quota. RPM blips recover; daily quota
 * does not, so we skip that key for the rest of the process.
 */
const geminiDailyExhausted = new Set<string>();

export function resetGeminiKeyPool(): void {
    geminiKeyCursor.value = 0;
    geminiDailyExhausted.clear();
}

function geminiKeysOf(cfg: ProviderConfig): string[] {
    if (cfg.apiKeys?.length) return cfg.apiKeys;
    return cfg.apiKey ? [cfg.apiKey] : [];
}

/** Daily / project quota — skip the key. RPM-only RESOURCE_EXHAUSTED still rotates. */
function isGeminiDailyQuota(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /exceeded your current quota|Quota exceeded|PerDay|per day|free_tier|GenerateRequestsPerDay/i.test(
        msg,
    );
}

export class GeminiGateway implements NamedGateway {
    readonly name = 'gemini';
    private readonly clients = new Map<string, GoogleGenAI>();

    constructor(private readonly cfg: ProviderConfig = aiConfig().providers.gemini) {}

    get configured(): boolean {
        return geminiKeysOf(this.cfg).length > 0;
    }

    private sdk(apiKey: string): GoogleGenAI {
        let client = this.clients.get(apiKey);
        if (!client) {
            client = new GoogleGenAI({ apiKey });
            this.clients.set(apiKey, client);
        }
        return client;
    }

    private modelFor(tier: Tier): string {
        return tier === 'fast' ? this.cfg.models.fast : this.cfg.models.strong;
    }

    async complete(req: CompleteRequest): Promise<CompleteReply> {
        const keys = geminiKeysOf(this.cfg);
        if (keys.length === 0) {
            throw new GatewayError('internal', 'gemini: no API key configured', false);
        }

        const model = this.modelFor(req.tier);
        const startedAt = Date.now();
        const { temperature, topP } = samplingFor(req.job);

        let waitedMs = 0;
        let lastErr: unknown;

        const start = geminiKeyCursor.value % keys.length;
        geminiKeyCursor.value = start + 1;

        const callKey = async (apiKey: string) =>
            this.sdk(apiKey).models.generateContent({
                model,
                contents: req.user,
                config: {
                    ...(req.system ? { systemInstruction: req.system } : {}),
                    ...(req.schema
                        ? { responseMimeType: 'application/json', responseSchema: req.schema }
                        : {}),
                    ...(temperature === undefined ? {} : { temperature }),
                    ...(topP === undefined ? {} : { topP }),
                    abortSignal: attemptSignal(req.job, req.signal),
                },
            });

        const finish = (response: Awaited<ReturnType<typeof callKey>>): CompleteReply => {
            const usage = response.usageMetadata;
            return {
                provider: this.name,
                structuredOutput: req.schema ? 'response_schema' : 'none',
                text: response.text ?? '',
                model,
                inputTokens: usage?.promptTokenCount ?? 0,
                outputTokens: usage?.candidatesTokenCount ?? 0,
                latencyMs: Math.max(0, Date.now() - startedAt - waitedMs),
            };
        };

        // One pass around the key ring. A rate-limit rotates immediately — waiting
        // would burn wall clock on a spent key while others are still live.
        let lastIdx = start;
        for (let n = 0; n < keys.length; n++) {
            const idx = (start + n) % keys.length;
            const key = keys[idx];
            if (geminiDailyExhausted.has(key)) continue;
            lastIdx = idx;

            try {
                return finish(await callKey(key));
            } catch (err) {
                lastErr = err;
                const rateLimited = isRateLimitError(err) || isGeminiDailyQuota(err);
                if (!rateLimited) {
                    throw new GatewayError(
                        'generation_failed',
                        `gemini: ${err instanceof Error ? err.message : String(err)}`,
                        false,
                        err,
                    );
                }

                if (isGeminiDailyQuota(err)) {
                    geminiDailyExhausted.add(key);
                    console.warn(
                        `[gateway] gemini key ${idx + 1}/${keys.length} hit a daily/free-tier quota — skipping it.`,
                    );
                } else if (keys.length > 1) {
                    console.warn(
                        `[gateway] gemini key ${idx + 1}/${keys.length} rate-limited; rotating.`,
                    );
                }
            }
        }

        // Every live key rate-limited. Same-key backoff, then the chain may advance.
        const retryKey = keys[lastIdx];
        for (let attempt = 0; attempt < MAX_RATE_LIMIT_ATTEMPTS - 1; attempt++) {
            const waitMs = delayForAttempt(attempt, -1);
            console.warn(
                `[gateway] gemini rate-limited; waiting ${Math.round(waitMs / 1000)}s before retrying.`,
            );
            if (waitMs > 0) {
                await backoffClock().sleep(waitMs);
                waitedMs += waitMs;
            }
            try {
                return finish(await callKey(retryKey));
            } catch (err) {
                lastErr = err;
                const rateLimited = isRateLimitError(err) || isGeminiDailyQuota(err);
                if (!rateLimited) {
                    throw new GatewayError(
                        'generation_failed',
                        `gemini: ${err instanceof Error ? err.message : String(err)}`,
                        false,
                        err,
                    );
                }
            }
        }

        throw new GatewayError(
            'rate_limited',
            `gemini: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
            true,
            lastErr,
        );
    }
}
