import type { ErrorCode } from '@/lib/contracts';
import type { Provider, ProviderConfig } from '../config';
import { maxOutputFor, samplingFor, type Tier } from './tiers';
import { toJsonSchema } from './json-schema';
import { limiterFor, resetLimiters } from './rate-limit';
import {
    GatewayError,
    attemptSignal,
    type CompleteReply,
    type CompleteRequest,
    type NamedGateway,
} from './provider';
import { backoffClock, delayForAttempt, MAX_RATE_LIMIT_ATTEMPTS } from './backoff';

interface ChatCompletionResponse {
    choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string; type?: string; code?: string };
}

/** `provider:model` pairs found not to support json_schema, so we ask only once. */
const schemaSupport = new Set<string>();

/** Round-robin cursor per provider. Survives across complete() calls in this process. */
const keyCursors = new Map<Provider, number>();

/**
 * Keys that hit a daily token cap. RPM 429s recover in a minute; TPD does not,
 * so we skip that org for the rest of the process rather than waiting on it.
 */
const dailyExhausted = new Set<string>();

export function resetKeyPool(): void {
    keyCursors.clear();
    dailyExhausted.clear();
    resetLimiters();
}

function keysOf(cfg: ProviderConfig): string[] {
    if (cfg.apiKeys?.length) return cfg.apiKeys;
    return cfg.apiKey ? [cfg.apiKey] : [];
}

function isDailyTokenCap(detail: string): boolean {
    // TPM 429s also carry `"type":"tokens"`. Skipping those would burn every
    // org for the rest of the process after one per-minute blip.
    return /tokens per day|\bTPD\b|tokens\/day/i.test(detail)
        || /Limit 200000/i.test(detail);
}

/** Seconds or an HTTP date. Returns -1 when absent; `0` means retry immediately. */
export function retryAfterMs(header: string | null): number {
    if (!header) return -1;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const at = Date.parse(header);
    return Number.isNaN(at) ? -1 : Math.max(0, at - Date.now());
}

/** ~4 chars per token. */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/** Any OpenAI-compatible chat-completions endpoint (Groq, Cerebras, …). */
export class OpenAICompatGateway implements NamedGateway {
    constructor(
        readonly name: Provider,
        private readonly cfg: ProviderConfig,
    ) {}

    get configured(): boolean {
        return keysOf(this.cfg).length > 0;
    }

    private modelFor(tier: Tier): string {
        return tier === 'fast' ? this.cfg.models.fast : this.cfg.models.strong;
    }

    async complete(req: CompleteRequest): Promise<CompleteReply> {
        const keys = keysOf(this.cfg);
        if (keys.length === 0) {
            throw new GatewayError('internal', `${this.name}: no API key configured`, false);
        }

        const model = this.modelFor(req.tier);
        const startedAt = Date.now();

        const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
        if (req.system) messages.push({ role: 'system', content: req.system });
        messages.push({ role: 'user', content: req.user });

        // AC-F10-5: reject before dispatch, not after.
        const estimatedInput = estimateTokens((req.system ?? '') + req.user);
        const ceiling = this.cfg.quota.maxRequestTokens;
        if (estimatedInput > ceiling) {
            throw new GatewayError(
                'validation_failed',
                `${this.name}: input ~${estimatedInput} tokens exceeds the ${ceiling}-token ceiling`,
                false,
            );
        }

        const { temperature, topP } = samplingFor(req.job);

        const body: Record<string, unknown> = {
            model,
            messages,
            max_tokens: maxOutputFor(req.job),
            // Omitted entirely when unconfigured, so the provider default stands.
            ...(temperature === undefined ? {} : { temperature }),
            ...(topP === undefined ? {} : { top_p: topP }),
        };

        if (req.schema) {
            // Strict json_schema enforces enums provider-side; not every model
            // supports it, so a rejection degrades to json_object below.
            body.response_format = schemaSupport.has(`${this.name}:${model}`)
                ? { type: 'json_object' }
                : {
                    type: 'json_schema',
                    json_schema: { name: 'reply', strict: true, schema: toJsonSchema(req.schema) },
                };
            const mentionsJson = /json/i.test(req.system ?? '') || /json/i.test(req.user);
            if (!mentionsJson) {
                messages[messages.length - 1].content += '\n\nRespond with a single JSON object.';
            }
        }

        const send = async (apiKey: string): Promise<Response> => {
            try {
                return await fetch(`${this.cfg.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(body),
                    signal: attemptSignal(req.job, req.signal),
                });
            } catch (err) {
                const timedOut =
                    err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
                throw new GatewayError(
                    'generation_failed',
                    `${this.name}: ${timedOut ? 'request timed out' : 'network error'}`,
                    true,
                    err,
                );
            }
        };

        // Pacing and Retry-After waits are client-side, so they are excluded from
        // latencyMs — NFR-003 is measured on provider time, not on our own waiting.
        let waitedMs = 0;

        const start = keyCursors.get(this.name) ?? 0;
        keyCursors.set(this.name, start + 1);

        const finish = async (
            res: Response,
            limiter: ReturnType<typeof limiterFor>,
        ): Promise<CompleteReply> => {
            const data = (await res.json()) as ChatCompletionResponse;
            const choice = data.choices?.[0];
            const text = choice?.message?.content ?? '';
            limiter.record(data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0);

            if (choice?.finish_reason === 'length') {
                throw new GatewayError(
                    'generation_failed',
                    `${this.name}: the reply was cut off at the ${maxOutputFor(req.job)}-token `
                        + `output ceiling (${req.job}). Raise AI_OUTPUT_${req.job.toUpperCase()}_TOKENS `
                        + 'or shorten the request.',
                    false,
                );
            }

            const mode = body.response_format as { type?: string } | undefined;

            return {
                provider: this.name,
                structuredOutput: (mode?.type as CompleteReply['structuredOutput']) ?? 'none',
                text,
                model,
                inputTokens: data.usage?.prompt_tokens ?? 0,
                outputTokens: data.usage?.completion_tokens ?? 0,
                latencyMs: Math.max(0, Date.now() - startedAt - waitedMs),
            };
        };

        const tryKey = async (idx: number): Promise<Response> => {
            const limiter = limiterFor(`${this.name}:${idx}`, this.cfg.quota);
            waitedMs += await limiter.acquire(estimatedInput);
            let res = await send(keys[idx]);

            if (res.status === 400 && body.response_format) {
                const why = await res.clone().text().catch(() => '');
                if (/response.?format|json_schema/i.test(why)) {
                    schemaSupport.add(`${this.name}:${model}`);
                    console.warn(
                        `[gateway] ${this.name}/${model} does not support json_schema — ` +
                            'falling back to json_object; enums are no longer provider-enforced.',
                    );
                    body.response_format = { type: 'json_object' };
                    res = await send(keys[idx]);
                }
            }

            return res;
        };

        const fail = async (res: Response): Promise<never> => {
            const detail = await res.text().catch(() => '');
            const retryable = res.status === 429 || res.status >= 500;
            const byStatus: Record<number, ErrorCode> = {
                401: 'unauthorized',
                403: 'forbidden',
                402: 'payment_required',
                404: 'not_found',
                429: 'rate_limited',
            };
            const code: ErrorCode = byStatus[res.status] ?? 'generation_failed';
            throw new GatewayError(
                code,
                `${this.name}: HTTP ${res.status}`,
                retryable,
                detail,
            );
        };

        let last: { idx: number; res: Response } | null = null;

        // One pass around the key ring. A 429 rotates immediately — waiting
        // would burn wall clock on an org that is already spent while four
        // others are still live.
        for (let n = 0; n < keys.length; n++) {
            const idx = (start + n) % keys.length;
            const key = keys[idx];
            if (dailyExhausted.has(key)) continue;

            const res = await tryKey(idx);
            last = { idx, res };

            if (res.ok) {
                return finish(res, limiterFor(`${this.name}:${idx}`, this.cfg.quota));
            }

            if (res.status !== 429) await fail(res);

            const detail = await res.clone().text().catch(() => '');
            if (isDailyTokenCap(detail)) {
                dailyExhausted.add(key);
                console.warn(
                    `[gateway] ${this.name} key ${idx + 1}/${keys.length} hit the daily token cap — skipping it.`,
                );
            } else if (keys.length > 1) {
                console.warn(
                    `[gateway] ${this.name} key ${idx + 1}/${keys.length} rate-limited; rotating.`,
                );
            }
        }

        // Every live key 429'd. Same-key backoff, then the chain may advance.
        const retryIdx = last?.idx ?? (start % keys.length);
        let res = last?.res ?? await tryKey(retryIdx);

        for (let attempt = 0; res.status === 429 && attempt < MAX_RATE_LIMIT_ATTEMPTS - 1; attempt++) {
            const waitMs = delayForAttempt(attempt, retryAfterMs(res.headers.get('retry-after')));
            console.warn(
                `[gateway] ${this.name} rate-limited; waiting ${Math.round(waitMs / 1000)}s before retrying.`,
            );
            if (waitMs > 0) {
                await backoffClock().sleep(waitMs);
                waitedMs += waitMs;
            }
            res = await tryKey(retryIdx);
        }

        if (!res.ok) await fail(res);
        return finish(res, limiterFor(`${this.name}:${retryIdx}`, this.cfg.quota));
    }
}
