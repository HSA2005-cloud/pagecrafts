import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FallbackGateway } from '@/lib/ai/gateway/fallback';
import {
    GatewayError,
    type CompleteReply,
    type CompleteRequest,
    type NamedGateway,
} from '@/lib/ai/gateway/provider';
import type { Provider } from '@/lib/ai/config';

const req: CompleteRequest = { tier: 'fast', job: 'classify', user: 'hi' };

function reply(provider: Provider): CompleteReply {
    return { provider, text: 'ok', model: `${provider}-model`, inputTokens: 1, outputTokens: 1, latencyMs: 1 };
}

/** A named gateway that either serves a reply or throws a given error. */
function stub(name: Provider, outcome: CompleteReply | Error): NamedGateway {
    return {
        name,
        configured: true,
        complete: vi.fn(async () => {
            if (outcome instanceof Error) throw outcome;
            return outcome;
        }),
    };
}

describe('FallbackGateway', () => {
    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
    afterEach(() => vi.restoreAllMocks());

    it('serves from the first provider when it succeeds', async () => {
        const groq = stub('groq', reply('groq'));
        const cerebras = stub('cerebras', reply('cerebras'));
        const out = await new FallbackGateway([groq, cerebras]).complete(req);
        expect(out.provider).toBe('groq');
        expect(cerebras.complete).not.toHaveBeenCalled();
    });

    it('advances to the next provider when one is rate-limited', async () => {
        const groq = stub('groq', new GatewayError('rate_limited', 'groq 429', true));
        const cerebras = stub('cerebras', reply('cerebras'));
        const out = await new FallbackGateway([groq, cerebras]).complete(req);
        expect(out.provider).toBe('cerebras');
    });

    it('reaches gemini only when groq and cerebras both fail', async () => {
        const chain = [
            stub('groq', new GatewayError('rate_limited', 'groq down', true)),
            stub('cerebras', new GatewayError('generation_failed', 'cerebras down', true)),
            stub('gemini', reply('gemini')),
        ];
        const out = await new FallbackGateway(chain).complete(req);
        expect(out.provider).toBe('gemini');
    });

    it('D6: advances on unauthorized and warns to check the key', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const groq = stub('groq', new GatewayError('unauthorized', 'groq 401', false));
        const cerebras = stub('cerebras', reply('cerebras'));
        const out = await new FallbackGateway([groq, cerebras]).complete(req);
        expect(out.provider).toBe('cerebras');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('GROQ_API_KEY'));
    });

    // Provider-specific faults — the next provider may well serve.
    it.each([
        ['payment_required' as const, 'cerebras: HTTP 402'],
        ['not_found' as const, 'cerebras: HTTP 404'],
        ['forbidden' as const, 'cerebras: HTTP 403'],
    ])('advances past a provider-specific %s fault', async (code, msg) => {
        const cerebras = stub('cerebras', new GatewayError(code, msg, false));
        const gemini = stub('gemini', reply('gemini'));
        const out = await new FallbackGateway([cerebras, gemini]).complete(req);
        expect(out.provider).toBe('gemini');
        expect(gemini.complete).toHaveBeenCalledOnce();
    });

    it('stops re-attempting a provider that is unfunded, after the first call', async () => {
        const cerebras = stub('cerebras', new GatewayError('payment_required', 'HTTP 402', false));
        const gemini = stub('gemini', reply('gemini'));
        const gw = new FallbackGateway([cerebras, gemini]);

        for (let i = 0; i < 3; i++) expect((await gw.complete(req)).provider).toBe('gemini');

        expect(cerebras.complete).toHaveBeenCalledOnce();
        expect(gemini.complete).toHaveBeenCalledTimes(3);
    });

    it('still tries a disabled provider when it is the only one left', async () => {
        const solo = stub('cerebras', new GatewayError('payment_required', 'HTTP 402', false));
        const gw = new FallbackGateway([solo]);
        await expect(gw.complete(req)).rejects.toThrow(/402/);
        await expect(gw.complete(req)).rejects.toThrow(/402/);
        expect(solo.complete).toHaveBeenCalledTimes(2);
    });

    it('D7: stops immediately on a validation_failed fault', async () => {
        const groq = stub('groq', new GatewayError('validation_failed', 'too big', false));
        const cerebras = stub('cerebras', reply('cerebras'));
        await expect(new FallbackGateway([groq, cerebras]).complete(req))
            .rejects.toMatchObject({ code: 'validation_failed' });
        expect(cerebras.complete).not.toHaveBeenCalled();
    });

    it('stops on a non-retryable generation_failed (400-shaped)', async () => {
        const groq = stub('groq', new GatewayError('generation_failed', 'groq HTTP 400', false));
        const cerebras = stub('cerebras', reply('cerebras'));
        await expect(new FallbackGateway([groq, cerebras]).complete(req)).rejects.toThrow(/HTTP 400/);
        expect(cerebras.complete).not.toHaveBeenCalled();
    });

    it('throws an aggregate error naming every failure when all providers fail', async () => {
        const chain = [
            stub('groq', new GatewayError('rate_limited', 'groq down', true)),
            stub('gemini', new GatewayError('generation_failed', 'gemini down', true)),
        ];
        await expect(new FallbackGateway(chain).complete(req)).rejects.toThrow(/groq down.*gemini down/);
    });

    it('refuses to build an empty chain', () => {
        expect(() => new FallbackGateway([])).toThrow(/at least one/);
    });

    it('D4: honours one overall deadline when every provider stalls', async () => {
        const stalling = (name: Provider): NamedGateway => ({
            name,
            configured: true,
            complete: (r) =>
                new Promise<CompleteReply>((_, reject) => {
                    const abort = () => reject(new GatewayError('generation_failed', `${name} aborted`, true));
                    if (r.signal?.aborted) return abort();
                    r.signal?.addEventListener('abort', abort, { once: true });
                }),
        });

        const started = Date.now();
        const gw = new FallbackGateway([stalling('groq'), stalling('cerebras'), stalling('gemini')], 80);
        await expect(gw.complete(req)).rejects.toThrow(/all AI providers failed/);
        const elapsed = Date.now() - started;

        expect(elapsed).toBeGreaterThanOrEqual(60);
        expect(elapsed).toBeLessThan(1000);
    });

    it('tries a preferred provider first even when it is not head of the order', async () => {
        const groq = stub('groq', reply('groq'));
        const gemini = stub('gemini', reply('gemini'));
        const out = await new FallbackGateway([groq], undefined, [gemini, groq]).complete({
            ...req,
            prefer: 'gemini',
        });
        expect(out.provider).toBe('gemini');
        expect(gemini.complete).toHaveBeenCalledOnce();
        expect(groq.complete).not.toHaveBeenCalled();
    });

    it('falls through the default chain when the preferred provider fails', async () => {
        const groq = stub('groq', reply('groq'));
        const gemini = stub('gemini', new GatewayError('rate_limited', 'gemini 429', true));
        const out = await new FallbackGateway([groq], undefined, [gemini, groq]).complete({
            ...req,
            prefer: 'gemini',
        });
        expect(out.provider).toBe('groq');
    });
});
