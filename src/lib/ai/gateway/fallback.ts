import { timeoutFor } from './tiers';
import {
    GatewayError,
    type CompleteReply,
    type CompleteRequest,
    type Gateway,
    type NamedGateway,
} from './provider';

/** Defines error conditions where fallback logic should try the next provider. */
const ADVANCE_ON: ReadonlySet<string> = new Set([
    'rate_limited', 'unauthorized', 'forbidden', 'payment_required',
    'spend_capped', 'not_found', 'hosting_error',
]);

/** Faults that will not fix themselves mid-run, so the provider is dropped. */
const TERMINAL: ReadonlySet<string> = new Set([
    'unauthorized', 'forbidden', 'payment_required',
]);

function shouldAdvance(err: unknown): boolean {
    if (err instanceof GatewayError) {
        if (err.code === 'validation_failed') return false;
        return err.retryable || ADVANCE_ON.has(err.code);
    }
    return true;
}

/** Tries a chain of providers in priority order under a single overall deadline. */
export class FallbackGateway implements Gateway {
    /** Repeating conditions already reported, so a dead provider logs once. */
    private readonly warned = new Set<string>();

    /** Dropped for this gateway's lifetime; retrying them only costs a round-trip. */
    private readonly disabled = new Set<string>();

    constructor(
        private readonly chain: NamedGateway[],
        /** Overall budget in ms; defaults to the per-job timeout. Injectable for tests. */
        private readonly deadlineMs?: number,
        /**
         * Every configured provider, including ones not in the default order — so a
         * `prefer: 'gemini'` call can still reach Gemini when the order is `groq` only.
         */
        private readonly roster: NamedGateway[] = chain,
    ) {
        if (chain.length === 0) {
            throw new Error('FallbackGateway needs at least one provider.');
        }
    }

    private warnOnce(key: string, message: string): void {
        if (this.warned.has(key)) return;
        this.warned.add(key);
        console.warn(message);
    }

    async complete(req: CompleteRequest): Promise<CompleteReply> {
        const budget = AbortSignal.timeout(this.deadlineMs ?? timeoutFor(req.job));
        const signal = req.signal ? AbortSignal.any([req.signal, budget]) : budget;
        const attempt: CompleteRequest = { ...req, signal };

        const failures: string[] = [];

        // Never disable the last provider standing.
        const usable = this.chain.filter((gw) => !this.disabled.has(gw.name));
        let chain = usable.length ? usable : this.chain;

        if (req.prefer) {
            const preferred = this.roster.find(
                (gw) => gw.name === req.prefer && !this.disabled.has(gw.name),
            );
            if (preferred) {
                chain = [preferred, ...chain.filter((gw) => gw.name !== preferred.name)];
            }
        }

        for (let i = 0; i < chain.length; i++) {
            const gw = chain[i];
            try {
                const reply = await gw.complete(attempt);
                if (failures.length) {
                    this.warnOnce(
                        `served:${gw.name}:${failures[0]}`,
                        `[gateway] ${gw.name} served after fallback — ${failures.join(' | ')}`,
                    );
                }
                return reply;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                failures.push(`${gw.name}: ${message}`);

                // Config mistakes, not outages — name the thing to go and fix.
                if (err instanceof GatewayError) {
                    if (err.code === 'unauthorized' || err.code === 'forbidden') {
                        this.warnOnce(
                            `key:${gw.name}`,
                            `[gateway] ${gw.name} rejected the API key — check ${gw.name.toUpperCase()}_API_KEY.`,
                        );
                    } else if (err.code === 'payment_required' || err.code === 'spend_capped') {
                        this.warnOnce(
                            `billing:${gw.name}`,
                            `[gateway] ${gw.name} has no quota left — check billing for ${gw.name}.`,
                        );
                    }
                    if (TERMINAL.has(err.code) && chain.length > 1) {
                        this.disabled.add(gw.name);
                    }
                }

                if (!shouldAdvance(err)) throw err;

                const next = chain[i + 1];
                if (next) {
                    this.warnOnce(
                        `fallback:${gw.name}:${next.name}:${err instanceof GatewayError ? err.code : 'error'}`,
                        `[gateway] ${gw.name} failed (${message}); falling back to ${next.name}`,
                    );
                }
            }
        }

        throw new GatewayError(
            'generation_failed',
            `all AI providers failed — ${failures.join(' | ')}`,
            false,
            // An availability failure, not a bad reply — the repair path skips it.
            { failures, chainExhausted: true },
        );
    }
}
