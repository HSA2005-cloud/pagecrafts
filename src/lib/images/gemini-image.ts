import "server-only";
import { GoogleGenAI } from "@google/genai";
import { aiConfig } from "@/lib/ai/config";

/**
 * Photographs drawn by Gemini for a generated site.
 *
 * The division of labour: Gemini draws the pictures, Groq builds the HTML. They never meet —
 * this returns a URL, and the URL is what gets stamped onto the composition before the page
 * is rendered, exactly where an Unsplash URL used to go. Groq is not told an image was
 * generated and does not need to be.
 *
 * Every failure here returns null rather than throwing. A site with a stock photograph is a
 * site; a site that failed to build because an image model was busy is not. The caller falls
 * back to Unsplash and then to the bundled bank, so there are three floors under this.
 */

export interface GeneratedImage {
    bytes: Uint8Array;
    mimeType: string;
    /** The prompt actually sent, for the asset's provenance record. */
    prompt: string;
}

export interface GenerateImageOptions {
    /** "16:9" for heroes, "4:3" for cards. Anything the model rejects falls back. */
    aspectRatio?: string;
    signal?: AbortSignal;
}

const clients = new Map<string, GoogleGenAI>();

/** Round-robin across the configured keys, so four keys are four times the daily quota. */
const cursor = { value: 0 };

/**
 * Keys that have spent their day. An RPM blip recovers in a minute and is worth rotating
 * past; a daily quota does not recover inside a build, so the key is set aside for the rest
 * of the process instead of being tried again on every image.
 */
const exhausted = new Set<string>();

export function resetImageKeyPool(): void {
    cursor.value = 0;
    exhausted.clear();
}

export function imageKeys(): string[] {
    const cfg = aiConfig().providers.gemini;
    if (cfg.apiKeys?.length) return cfg.apiKeys;
    return cfg.apiKey ? [cfg.apiKey] : [];
}

export function imageModel(): string {
    return aiConfig().images.model;
}

/** False when no Gemini key is configured — the whole feature then costs nothing. */
export function isImageGenerationConfigured(): boolean {
    return imageKeys().length > 0;
}

function sdk(apiKey: string): GoogleGenAI {
    let client = clients.get(apiKey);
    if (!client) {
        client = new GoogleGenAI({ apiKey });
        clients.set(apiKey, client);
    }
    return client;
}

function isDailyQuota(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /exceeded your current quota|Quota exceeded|PerDay|per day|free_tier|GenerateRequestsPerDay/i.test(
        msg,
    );
}

/**
 * The instruction sent to the model.
 *
 * The negatives earn their place. Image models put invented shop names and slogans into
 * storefronts by default, and a hero with "RESTORANT" spelled across it is worse than no
 * photograph at all — the words are baked into the pixels and nobody can edit them out in
 * our editor. Same for logos and watermarks.
 */
export function imagePromptFor(query: string): string {
    const subject = query.trim().replace(/\s+/g, " ").slice(0, 300);

    return [
        `A professional photograph for a small business website: ${subject}.`,
        "Real photography, natural daylight, shallow depth of field, warm and inviting,",
        "clean uncluttered composition with room for a headline.",
        "No text, no words, no letters, no signage, no logos, no watermarks, no borders,",
        "no collage, no user interface, no illustration.",
    ].join(" ");
}

function imageFromResponse(
    parts: Array<{ inlineData?: { data?: string; mimeType?: string } }> | undefined,
): { bytes: Uint8Array; mimeType: string } | null {
    for (const part of parts ?? []) {
        const data = part.inlineData?.data;
        if (!data) continue;
        const bytes = Uint8Array.from(Buffer.from(data, "base64"));
        if (bytes.byteLength === 0) continue;
        return { bytes, mimeType: part.inlineData?.mimeType || "image/png" };
    }
    return null;
}

/**
 * One photograph, or null.
 *
 * Tries each key once, starting where the last call left off. A rate-limited key rotates to
 * the next immediately rather than waiting: the caller is holding a build open and a photo
 * is optional, so a fast "no" beats a slow "yes".
 */
export async function generateImage(
    query: string,
    options: GenerateImageOptions = {},
): Promise<GeneratedImage | null> {
    const keys = imageKeys();
    if (keys.length === 0) return null;

    const prompt = imagePromptFor(query);
    const model = imageModel();
    const start = cursor.value % keys.length;
    cursor.value = start + 1;

    for (let i = 0; i < keys.length; i += 1) {
        if (options.signal?.aborted) return null;

        const key = keys[(start + i) % keys.length]!;
        if (exhausted.has(key)) continue;

        try {
            if (model.startsWith('imagen-')) {
                const response = await sdk(key).models.generateImages({
                    model,
                    prompt,
                    config: {
                        numberOfImages: 1,
                        outputMimeType: 'image/png',
                        aspectRatio: options.aspectRatio === '16:9' ? '16:9' : options.aspectRatio === '4:3' ? '4:3' : '1:1',
                        ...(options.signal ? { abortSignal: options.signal } : {}),
                    },
                });

                const b64 = response.generatedImages?.[0]?.image?.imageBytes;
                if (b64) {
                    const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
                    if (bytes.byteLength > 0) {
                        return { bytes, mimeType: 'image/png', prompt };
                    }
                }
            } else {
                const response = await sdk(key).models.generateContent({
                    model,
                    contents: prompt,
                    config: {
                        responseModalities: ["TEXT", "IMAGE"],
                        imageConfig: {
                            imageSize: "1K",
                            ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
                        },
                        ...(options.signal ? { abortSignal: options.signal } : {}),
                    },
                });

                const found = imageFromResponse(response.candidates?.[0]?.content?.parts);
                if (found) return { ...found, prompt };
            }

            console.warn("[images] gemini returned no image part; falling back to stock.");
            return null;
        } catch (err) {
            if (isDailyQuota(err)) {
                exhausted.add(key);
                console.warn(
                    `[images] gemini key ${i + 1}/${keys.length} is out of daily image quota — setting it aside.`,
                );
                continue;
            }
            console.warn(
                `[images] gemini key ${i + 1}/${keys.length} failed — ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    return null;
}
