import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { aiConfig } from "@/lib/ai/config";
import { createAssetFromUpload } from "@/lib/data/project-assets";
import { bytesLookGrayscale } from "./color-guard";
import { generateImage, isImageGenerationConfigured } from "./gemini-image";

/**
 * The photograph lookup a generated site is built with.
 *
 * Gemini draws the pictures; Groq writes the HTML around them. This sits between: it is
 * handed a search phrase by the composition stamper, and it hands back a URL. What is behind
 * that URL — a generated photograph in our storage bucket, an Unsplash result, or a bundled
 * fallback — is nobody else's concern.
 *
 * Three things bound it, and all three are here rather than spread around because they are
 * really one decision: how much of a person's build is worth spending on pictures.
 *
 *   count     — a generated site asks for a photo per section per look. Left alone that is
 *               twenty images for one build, which is a minute of waiting and a day's free
 *               quota gone on a single site.
 *   clock     — image models are slower than text models and occasionally much slower. Past
 *               the deadline every remaining slot takes stock immediately, so a slow image
 *               service delays a build instead of holding it hostage.
 *   memory    — the same phrase asks once. Three looks are built from one composition and
 *               share their heroes, so the Free hero and the Pro hero are the same
 *               photograph, drawn once. This also makes the tiers comparable, which the
 *               pricing page rather depends on.
 *
 * Every failure falls through to stock. A site with a stock photograph is a site.
 */

export type PhotoLookup = (query: string, sectionType?: string) => Promise<string>;

export interface SitePhotoOptions {
    supabase: SupabaseClient;
    userId: string;
    projectId: string;
    /**
     * The floor, and not optional.
     *
     * The job runner owns this: its lookup already knows the job's salt and which heroes
     * earlier Sets of this project used, and rebuilding either of those here would be a
     * second copy that quietly drifts from the first. So the runner hands one in and this
     * only decides whether to try something better before falling back to it.
     */
    fallback: (query: string) => Promise<string>;
    /** How many photographs Gemini may draw for one build. */
    maxImages?: number;
    /** Wall clock for the whole set, from the moment the lookup is created. */
    budgetMs?: number;

    // Seams, in the same spirit as stampPhotoUrls taking its own lookup: the budget and
    // fallback rules below are the part worth testing, and they should be testable without
    // an image model, a storage bucket or a network.
    /** Draws one photograph, or returns null when it cannot. */
    generate?: typeof generateImage;
    /** Puts the bytes somewhere the published page can fetch them, and returns that URL. */
    store?: (image: { bytes: Uint8Array; mimeType: string }) => Promise<string | null>;
}

/** Below this a call cannot realistically finish, so it is not worth starting. */
const MIN_USEFUL_MS = 8_000;

/** On wherever there is a key, and AI_IMAGE_GENERATION=off turns it off everywhere. */
export function isSiteImageGenerationEnabled(): boolean {
    return aiConfig().images.enabled && isImageGenerationConfigured();
}

/** Heroes and banners want to be wide; cards and galleries do not. */
function aspectFor(sectionType?: string): string {
    if (!sectionType) return "16:9";
    return /hero|banner|cta|cover/i.test(sectionType) ? "16:9" : "4:3";
}

/**
 * Shrink a 1K PNG into a WebP a phone can actually load.
 *
 * The model returns roughly a megabyte and a half of PNG. Shipping that to someone on a
 * mobile connection in India would undo every other thing we do about speed. sharp is
 * already a dependency; if it fails to load for any reason the original bytes are stored
 * unchanged, because a heavy photograph still beats no photograph.
 */
let warnedAboutSharp = false;

async function shrink(
    bytes: Uint8Array,
    mimeType: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
    try {
        const sharp = (await import("sharp")).default;
        const out = await sharp(Buffer.from(bytes))
            .resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 78 })
            .toBuffer();
        if (out.byteLength > 0 && out.byteLength < bytes.byteLength) {
            return { bytes: Uint8Array.from(out), mimeType: "image/webp" };
        }
    } catch (err) {
        // Once per process. It is the same answer for every image in every build, and four
        // copies of a stack trace per site buries everything else in the log.
        if (!warnedAboutSharp) {
            warnedAboutSharp = true;
            console.warn(
                `[images] storing photographs uncompressed — ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
    return { bytes, mimeType };
}

export function createSitePhotoLookup(options: SitePhotoOptions): PhotoLookup {
    const generate = options.generate ?? generateImage;
    const { fallback } = options;
    const store = options.store ?? (async (image) => {
        const asset = await createAssetFromUpload(
            options.supabase,
            options.userId,
            options.projectId,
            image,
            "image",
        );
        return asset.url;
    });
    const maxImages = options.maxImages ?? aiConfig().images.maxPerSite;
    const budgetMs = options.budgetMs ?? aiConfig().images.budgetMs;
    const deadline = Date.now() + budgetMs;

    // Decided once, at the top, rather than per lookup. A caller that brought its own
    // generator has said generation is available — asking the environment for a Gemini key
    // on top of that would only mean the seam could never be exercised.
    const canDraw =
        maxImages > 0
        && aiConfig().images.enabled
        && (Boolean(options.generate) || isImageGenerationConfigured());

    // Promises, not URLs. The stamper resolves a composition's sections in parallel, so two
    // sections asking the same thing at the same moment would otherwise both start a call
    // and pay twice for one picture.
    const inFlight = new Map<string, Promise<string>>();
    let drawn = 0;

    const draw = async (query: string, sectionType?: string): Promise<string | null> => {
        const remaining = deadline - Date.now();
        if (remaining < MIN_USEFUL_MS) return null;

        const generated = await generate(query, {
            aspectRatio: aspectFor(sectionType),
            signal: AbortSignal.timeout(remaining),
        });
        if (!generated) return null;

        // Gemini sometimes returns editorial B&W shop interiors. Those made Photo-rich
        // look broken next to colour Casual — refuse and take stock instead.
        if (await bytesLookGrayscale(generated.bytes)) {
            console.warn(
                `[images] rejecting grayscale photograph for "${query}" — falling back to colour stock.`,
            );
            return null;
        }

        return store(await shrink(generated.bytes, generated.mimeType));
    };

    return (query, sectionType) => {
        const key = `${sectionType ?? ""}|${query.trim().toLowerCase()}`;
        const seen = inFlight.get(key);
        if (seen) return seen;

        const settle = (async () => {
            // Claimed before the await, so parallel sections cannot all pass the check and
            // then draw six pictures against a budget of four.
            const mayDraw = canDraw && drawn < maxImages;
            if (mayDraw) drawn += 1;

            if (mayDraw) {
                try {
                    const url = await draw(query, sectionType);
                    if (url) return url;
                } catch (err) {
                    console.warn(
                        `[images] generated photo for "${query}" did not stick — ${err instanceof Error ? err.message : String(err)}`,
                    );
                }
                // It did not produce a usable picture, so it did not really spend a slot.
                drawn -= 1;
            }

            return fallback(query);
        })();

        inFlight.set(key, settle);
        return settle;
    };
}
