import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Provider, ProviderQuota } from '../config';

const MINUTE_MS = 60_000;

interface Spend {
    at: number;
    tokens: number;
    /** Set by `acquire` so a concurrent caller sees the budget as spent before `record`. */
    reserved?: boolean;
}

/** Where a limiter's window survives between processes. */
export interface WindowStore {
    load(): Spend[];
    save(window: Spend[]): void;
}

export interface LimiterDeps {
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    store?: WindowStore;
}

/** Paces calls against a provider's per-minute limits using a rolling 60s window. */
export class RateLimiter {
    private window: Spend[] = [];
    private avgOutput = 800;
    private readonly now: () => number;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly store?: WindowStore;
    /**
     * D18 — concurrent `acquire` used to all see the same empty window, all
     * proceed, and over-admit. One waiter at a time, and a reservation so the
     * next waiter sees the budget as spent before the HTTP call returns.
     */
    private tail: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly quota: Pick<ProviderQuota, 'rpm' | 'tpm'>,
        deps: LimiterDeps = {},
    ) {
        this.now = deps.now ?? Date.now;
        this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
        this.store = deps.store;
        if (this.store) {
            // Pacing must never be why a generation fails.
            try {
                this.window = this.store.load();
                this.prune(this.now());
            } catch {
                this.window = [];
            }
        }
    }

    private persist(): void {
        try {
            this.store?.save(this.window);
        } catch {
            // Unusable state degrades pacing, never the call.
        }
    }

    private enqueue<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.tail.then(fn, fn);
        this.tail = run.then(() => undefined, () => undefined);
        return run;
    }

    private prune(at: number): void {
        while (this.window.length && at - this.window[0].at >= MINUTE_MS) this.window.shift();
    }

    private used(at: number): { tokens: number; requests: number } {
        this.prune(at);
        return {
            tokens: this.window.reduce((t, s) => t + s.tokens, 0),
            requests: this.window.length,
        };
    }

    /** How long to wait before a request costing ~`need` tokens can proceed. */
    private waitFor(need: number): number {
        const at = this.now();
        const { tokens, requests } = this.used(at);

        const overTokens = this.quota.tpm > 0 && tokens + need > this.quota.tpm;
        const overRequests = this.quota.rpm > 0 && requests + 1 > this.quota.rpm;
        if (!overTokens && !overRequests) return 0;

        // A call larger than the whole budget can never fit.
        if (this.window.length === 0) return 0;

        return Math.max(0, MINUTE_MS - (at - this.window[0].at));
    }

    /** Wait until this request fits the per-minute budget; returns ms spent waiting. */
    async acquire(estimatedInput: number): Promise<number> {
        return this.enqueue(async () => {
            const need = estimatedInput + this.avgOutput;
            let waited = 0;
            // Each wait retires the oldest slice, so this terminates.
            for (let wait = this.waitFor(need); wait > 0; wait = this.waitFor(need)) {
                await this.sleep(wait);
                waited += wait;
            }
            // Reserve before returning so a concurrent waiter cannot take the
            // same slice. `record` replaces this with the actual cost.
            this.window.push({ at: this.now(), tokens: need, reserved: true });
            this.prune(this.now());
            this.persist();
            return waited;
        });
    }

    /** Record what the call actually cost, and refine the output estimate. */
    record(inputTokens: number, outputTokens: number): void {
        const actual = inputTokens + outputTokens;
        const reserved = this.window.find((s) => s.reserved);
        if (reserved) {
            reserved.tokens = actual;
            reserved.reserved = false;
        } else {
            this.window.push({ at: this.now(), tokens: actual });
        }
        if (outputTokens > 0) {
            this.avgOutput = Math.round(this.avgOutput * 0.7 + outputTokens * 0.3);
        }
        this.prune(this.now());
        this.persist();
    }
}

const CACHE_DIR = join(process.cwd(), 'node_modules/.cache/pagecrafts');

/** Kept in the build cache. Fail-soft: unreadable state just means no pacing. */
export function fileWindowStore(provider: Provider): WindowStore {
    const file = join(CACHE_DIR, `rate-limit-${provider}.json`);
    return {
        load(): Spend[] {
            try {
                const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
                if (!Array.isArray(raw)) return [];
                return raw.filter(
                    (s): s is Spend =>
                        !!s && typeof s === 'object'
                        && typeof (s as Spend).at === 'number'
                        && typeof (s as Spend).tokens === 'number',
                );
            } catch {
                return [];
            }
        },
        save(window: Spend[]): void {
            try {
                mkdirSync(CACHE_DIR, { recursive: true });
                writeFileSync(file, JSON.stringify(window));
            } catch {
                // Read-only or ephemeral filesystem.
            }
        },
    };
}

/** Persist store state only outside Next.js runtime / test environments. */
function defaultStore(provider: Provider): WindowStore | undefined {
    if (process.env.NEXT_RUNTIME || process.env.VITEST) return undefined;
    return fileWindowStore(provider);
}

const limiters = new Map<Provider, RateLimiter>();

/** One limiter per provider, shared across gateway instances in the process. */
export function limiterFor(provider: Provider, quota: ProviderQuota): RateLimiter {
    let limiter = limiters.get(provider);
    if (!limiter) {
        limiter = new RateLimiter(quota, { store: defaultStore(provider) });
        limiters.set(provider, limiter);
    }
    return limiter;
}

/** Test seam — drops the shared limiters so state cannot leak between cases. */
export function resetLimiters(): void {
    limiters.clear();
}
