/**
 * Reject black-and-white / near-monochrome photographs.
 *
 * Gemini (and occasionally stock) will hand back an editorial B&W shop interior.
 * That made Photo-rich look broken next to colour Casual — customers sell colourful
 * products, not art-gallery mono. These helpers decide "too grey to ship".
 */

export interface ChannelMean {
    mean: number;
}

/**
 * True when the three colour channels are almost the same — i.e. the picture has
 * no real chroma left. Tuned so a lightly graded photo still passes, but a true
 * grayscale render does not.
 */
export function channelsLookGrayscale(
    channels: readonly ChannelMean[],
    maxMeanDiff = 12,
): boolean {
    if (channels.length < 3) return true;
    const r = channels[0]!.mean;
    const g = channels[1]!.mean;
    const b = channels[2]!.mean;
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    return maxDiff < maxMeanDiff;
}

/** Inspect image bytes with sharp; returns true when the photo is effectively B&W. */
export async function bytesLookGrayscale(bytes: Uint8Array): Promise<boolean> {
    // Tiny buffers are stubs / errors, not photographs — do not reject them here.
    if (bytes.byteLength < 256) return false;
    try {
        const sharp = (await import('sharp')).default;
        const stats = await sharp(Buffer.from(bytes)).stats();
        return channelsLookGrayscale(stats.channels);
    } catch {
        // If we cannot measure, do not block the photo — stock/fallback still applies
        // when generation itself fails.
        return false;
    }
}
