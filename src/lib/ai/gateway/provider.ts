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

export class GeminiGateway implements NamedGateway {
    readonly name = 'gemini';
    private client: GoogleGenAI | null = null;

    constructor(private readonly cfg: ProviderConfig = aiConfig().providers.gemini) {}

    get configured(): boolean {
        return this.cfg.apiKey.length > 0;
    }

    private sdk(): GoogleGenAI {
        return (this.client ??= new GoogleGenAI({ apiKey: this.cfg.apiKey }));
    }

    private modelFor(tier: Tier): string {
        return tier === 'fast' ? this.cfg.models.fast : this.cfg.models.strong;
    }

    async complete(req: CompleteRequest): Promise<CompleteReply> {
        const model = this.modelFor(req.tier);
        const startedAt = Date.now();
        const { temperature, topP } = samplingFor(req.job);

        let waitedMs = 0;
        let lastErr: unknown;

        for (let attempt = 0; attempt < MAX_RATE_LIMIT_ATTEMPTS; attempt++) {
            try {
                const response = await this.sdk().models.generateContent({
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
            } catch (err) {
                lastErr = err;
                const rateLimited = isRateLimitError(err);
                if (!rateLimited || attempt === MAX_RATE_LIMIT_ATTEMPTS - 1) {
                    throw new GatewayError(
                        rateLimited ? 'rate_limited' : 'generation_failed',
                        `gemini: ${err instanceof Error ? err.message : String(err)}`,
                        rateLimited,
                        err,
                    );
                }
                const waitMs = delayForAttempt(attempt, -1);
                console.warn(`[gateway] gemini rate-limited; waiting ${Math.round(waitMs / 1000)}s before retrying.`);
                if (waitMs > 0) {
                    await backoffClock().sleep(waitMs);
                    waitedMs += waitMs;
                }
            }
        }

        throw lastErr;
    }
}
