import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createSitePhotoLookup, type SitePhotoOptions } from '@/lib/images/site-photos';
import { imagePromptFor } from '@/lib/images/gemini-image';

// Gemini draws a generated site's photographs; Groq goes on building the HTML around them.
// What is tested here is the budget between them, because that is the part that decides
// whether a build takes twenty seconds or two minutes and whether one website spends a whole
// day's free image quota.
//
// No image model and no storage bucket: both are injected. The rules are the interesting
// part, not the SDK.

const supabase = {} as SupabaseClient;

const drewSomething = async () => ({
    bytes: Uint8Array.from([1, 2, 3]),
    mimeType: 'image/png',
    prompt: 'p',
});

function lookupWith(overrides: Partial<SitePhotoOptions>) {
    return createSitePhotoLookup({
        supabase,
        userId: 'u1',
        projectId: 'p1',
        fallback: async (query: string) => `stock:${query}`,
        ...overrides,
    });
}

describe('how many photographs one build may draw', () => {
    it('stops at the budget and takes stock for the rest', async () => {
        const generate = vi.fn(drewSomething);
        const store = vi.fn(async () => 'https://cdn/generated.webp');
        const lookup = lookupWith({ maxImages: 2, generate, store });

        const urls = await Promise.all(
            ['bakery shelf', 'cafe table', 'shop front', 'staff portrait'].map((q) => lookup(q)),
        );

        expect(generate).toHaveBeenCalledTimes(2);
        expect(urls.filter((u) => u.startsWith('stock:'))).toHaveLength(2);
    });

    // Three looks are built from one composition, and they ask for the same heroes. Without
    // this the Free hero, the Pro hero and the Premium hero are three separate calls for
    // three near-identical pictures — and the tiers stop being comparable.
    it('draws one photograph for a phrase however many times it is asked', async () => {
        const generate = vi.fn(drewSomething);
        const store = vi.fn(async () => 'https://cdn/one.webp');
        const lookup = lookupWith({ maxImages: 4, generate, store });

        const urls = await Promise.all([
            lookup('bakery shelf', 'hero'),
            lookup('bakery shelf', 'hero'),
            lookup('BAKERY SHELF ', 'hero'),
        ]);

        expect(generate).toHaveBeenCalledTimes(1);
        expect(new Set(urls).size).toBe(1);
    });

    // The claim happens before the await. Without that, four sections resolving in parallel
    // all read drawn === 0, all pass a budget of two, and four pictures get drawn.
    it('cannot overspend when every section asks at once', async () => {
        let live = 0;
        let peak = 0;
        const generate = vi.fn(async () => {
            live += 1;
            peak = Math.max(peak, live);
            await new Promise((r) => setTimeout(r, 5));
            live -= 1;
            return { bytes: Uint8Array.from([1]), mimeType: 'image/png', prompt: 'p' };
        });
        const lookup = lookupWith({
            maxImages: 2,
            generate,
            store: async () => 'https://cdn/x.webp',
        });

        await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((q) => lookup(q)));

        expect(peak).toBeLessThanOrEqual(2);
        expect(generate).toHaveBeenCalledTimes(2);
    });
});

describe('when it does not work', () => {
    it('takes stock when the model returns a black-and-white photograph', async () => {
        const sharp = (await import('sharp')).default;
        const gray = Uint8Array.from(
            await sharp({
                create: {
                    width: 256,
                    height: 256,
                    channels: 3,
                    background: { r: 90, g: 90, b: 90 },
                },
            }).png().toBuffer(),
        );
        const generate = vi.fn(async () => ({
            bytes: gray,
            mimeType: 'image/png',
            prompt: 'p',
        }));
        const store = vi.fn(async () => 'https://cdn/should-not-store.webp');
        const lookup = lookupWith({ maxImages: 2, generate, store });

        expect(await lookup('clothing boutique', 'hero')).toBe('stock:clothing boutique');
        expect(store).not.toHaveBeenCalled();
    });

    it('takes stock when the model returns nothing', async () => {
        const lookup = lookupWith({ maxImages: 2, generate: async () => null });
        expect(await lookup('bakery shelf')).toBe('stock:bakery shelf');
    });

    it('takes stock when storing the picture fails', async () => {
        const lookup = lookupWith({
            maxImages: 2,
            generate: drewSomething,
            store: async () => {
                throw new Error('project is out of image space');
            },
        });
        expect(await lookup('bakery shelf')).toBe('stock:bakery shelf');
    });

    // A call that produced nothing has not really spent a slot, and a person whose first
    // image failed should not lose the other three because of it.
    it('does not spend the budget on a call that produced nothing', async () => {
        let attempt = 0;
        const generate = vi.fn(async () => {
            attempt += 1;
            if (attempt === 1) return null;
            return { bytes: Uint8Array.from([1]), mimeType: 'image/png', prompt: 'p' };
        });
        const lookup = lookupWith({
            maxImages: 1,
            generate,
            store: async () => 'https://cdn/second.webp',
        });

        expect(await lookup('first')).toBe('stock:first');
        expect(await lookup('second')).toBe('https://cdn/second.webp');
    });

    // Image models are slower than text models and sometimes very much slower. Past the
    // deadline the remaining slots take stock without waiting, so a slow image service
    // delays a build rather than holding it open until the function times out.
    it('stops asking once the clock is spent', async () => {
        const generate = vi.fn(drewSomething);
        const lookup = lookupWith({ maxImages: 4, budgetMs: 0, generate });

        expect(await lookup('bakery shelf')).toBe('stock:bakery shelf');
        expect(generate).not.toHaveBeenCalled();
    });
});

describe('what the model is asked for', () => {
    // Image models write invented shop names into storefronts by default, and a hero with
    // "RESTORANT" across it is worse than no photograph — the letters are baked into the
    // pixels and nobody can edit them out in our editor.
    it('forbids text, logos and watermarks', () => {
        const prompt = imagePromptFor('bakery shelf in Hyderabad');

        expect(prompt).toContain('bakery shelf in Hyderabad');
        expect(prompt).toMatch(/no text/i);
        expect(prompt).toMatch(/no logos/i);
        expect(prompt).toMatch(/no watermarks/i);
    });

    it('demands full colour and forbids black-and-white', () => {
        const prompt = imagePromptFor('clothing boutique interior');

        expect(prompt).toMatch(/full-?colour|full-?color|colour photograph|color photograph/i);
        expect(prompt).toMatch(/never black and white/i);
        expect(prompt).toMatch(/never grayscale/i);
        expect(prompt).toMatch(/never monochrome/i);
    });

    it('does not let a long query run away with the prompt', () => {
        const prompt = imagePromptFor('x'.repeat(5_000));
        expect(prompt.length).toBeLessThan(800);
    });
});
