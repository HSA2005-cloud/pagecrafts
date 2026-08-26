import { afterEach, describe, expect, it, vi } from 'vitest';

import { expandBrief } from '@/lib/ai/generate/expand-brief';
import { setGateway } from '@/lib/ai/gateway';
import type { CompleteReply, CompleteRequest } from '@/lib/ai/gateway/provider';

afterEach(() => {
    setGateway(null);
    vi.restoreAllMocks();
});

describe('expandBrief', () => {
    it('asks Gemini first and returns a longer detailed prompt', async () => {
        const seen: CompleteRequest[] = [];
        setGateway({
            async complete(req: CompleteRequest): Promise<CompleteReply> {
                seen.push(req);
                return {
                    provider: 'gemini',
                    text: JSON.stringify({
                        expandedPrompt:
                            'a website for Smile Dental, a family dental clinic in Koramangala offering check-ups, root canals and braces. Build a calm marketing site with hero, services, about, FAQ and contact so patients can book.',
                    }),
                    model: 'gemini-mock',
                    inputTokens: 10,
                    outputTokens: 40,
                    latencyMs: 5,
                };
            },
        });

        const result = await expandBrief(
            'a website for Smile Dental, family dental clinic, in Koramangala',
        );

        expect(result.data.expanded).toBe(true);
        expect(result.data.expandedPrompt).toContain('Smile Dental');
        expect(result.data.expandedPrompt.length).toBeGreaterThan(80);
        expect(seen[0]?.prefer).toBe('gemini');
    });

    it('soft-fails to the original brief when the model errors', async () => {
        setGateway({
            async complete(): Promise<CompleteReply> {
                throw new Error('gemini down');
            },
        });

        const brief = 'a website for Rise Bakery, cakes and brownies, in Indiranagar';
        const result = await expandBrief(brief);

        expect(result.data.expanded).toBe(false);
        expect(result.data.expandedPrompt).toBe(brief);
    });
});
