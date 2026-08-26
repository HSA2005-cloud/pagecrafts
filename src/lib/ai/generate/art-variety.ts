import type { ArtDirection, SectionKey } from '@/lib/contracts';
import type { StyleId, StyleSpec } from './styles';

/**
 * One art direction per business, not one per tier.
 *
 * STYLE_SPECS pinned every look to a single ArtDirection, so every Photo-rich site in the
 * product shared one theme, one motion, one radius, one spacing and one imagery treatment.
 * Two restaurants got the same site with different words in it -- which is the thing the
 * Rs 499 tier is sold as not being.
 *
 * The catalogue was always deep enough: 8 themes x 6 motions x 5 radii x 3 spacings x 5
 * imagery styles is 3,600 combinations, and the product used three of them.
 *
 * Each tier keeps its character -- Casual stays quiet, Animated stays kinetic -- and varies
 * inside it. A tier that could draw from everything would sell three names for one thing.
 */

/** Only ids the renderer actually knows. Anything else silently falls back to the default. */
const VARIANTS: Partial<Record<SectionKey, readonly string[]>> = {
    hero: ['centred', 'split-image', 'image-bg', 'minimal'],
    about: ['text', 'media-split'],
    services: ['cards', 'grid', 'timeline', 'tabs'],
    menu: ['grouped', 'simple'],
    gallery: ['masonry', 'grid', 'carousel'],
    team: ['cards', 'grid'],
    testimonials: ['quotes', 'cards'],
    faq: ['accordion', 'two-column'],
    contact: ['split-map', 'simple', 'form'],
    footer: ['simple', 'columns'],
};

/**
 * Theme, radius, spacing and imagery are not independent choices.
 *
 * Drawing them separately gave 3,600 combinations and no floor under any of them: a warm
 * cream restaurant was one draw, and grey documentary photographs on tight slate was the
 * next. Both were "varied". Only one was worth showing a customer.
 *
 * A mood is a set of four that were chosen to sit together. The draw picks a mood, so every
 * result is one somebody stands behind, and variety comes from which mood, which motion and
 * which section layouts -- not from hoping four independent rolls happen to agree.
 */
interface Mood {
    themeId: ArtDirection['themeId'];
    radiusId: ArtDirection['radiusId'];
    spacingId: ArtDirection['spacingId'];
    imageryId: ArtDirection['imageryId'];
}

const MOODS = {
    paper: { themeId: 'mono-precision', radiusId: 'soft', spacingId: 'default', imageryId: 'bright-clean' },
    note: { themeId: 'warm-editorial', radiusId: 'soft', spacingId: 'default', imageryId: 'bright-clean' },
    ward: { themeId: 'clinical-blue', radiusId: 'soft', spacingId: 'default', imageryId: 'bright-clean' },
    editorial: { themeId: 'warm-editorial', radiusId: 'soft', spacingId: 'airy', imageryId: 'warm-natural' },
    sunlit: { themeId: 'sunlit-craft', radiusId: 'organic', spacingId: 'airy', imageryId: 'bright-clean' },
    sage: { themeId: 'calm-sage', radiusId: 'organic', spacingId: 'airy', imageryId: 'warm-natural' },
    clinic: { themeId: 'clinical-blue', radiusId: 'framed', spacingId: 'airy', imageryId: 'bright-clean' },
    press: { themeId: 'mono-precision', radiusId: 'sharp', spacingId: 'airy', imageryId: 'documentary' },
    luxe: { themeId: 'deep-luxury', radiusId: 'framed', spacingId: 'airy', imageryId: 'muted-duotone' },
    slate: { themeId: 'tech-slate', radiusId: 'sharp', spacingId: 'tight', imageryId: 'bold-contrast' },
    voltage: { themeId: 'vivid-energy', radiusId: 'pill', spacingId: 'tight', imageryId: 'bold-contrast' },
} as const satisfies Record<string, Mood>;

interface Palette {
    moods: readonly Mood[];
    motions: readonly ArtDirection['motionId'][];
    sections: Partial<Record<SectionKey, readonly string[]>>;
}

/**
 * What each tier is allowed to reach for.
 *
 * Casual holds still: a free site that animates like the paid one is a free site nobody
 * upgrades from. Photo-rich draws from everything, because "your design, not a template" is
 * the whole promise. Animated keeps the darker, higher-contrast end, where motion reads as
 * intent rather than noise.
 */
const PALETTES: Record<StyleId, Palette> = {
    casual: {
        moods: [MOODS.paper, MOODS.note, MOODS.ward],
        motions: ['none'],
        sections: {
            hero: ['split-image', 'centred'],
            about: ['text'],
            services: ['grid'],
            menu: ['simple'],
            testimonials: ['quotes'],
            contact: ['simple'],
            footer: ['simple'],
        },
    },
    photos: {
        moods: [MOODS.editorial, MOODS.sunlit, MOODS.sage, MOODS.clinic, MOODS.press],
        motions: ['whisper', 'calm', 'editorial', 'showcase'],
        sections: {
            hero: ['image-bg', 'split-image'],
            about: ['media-split', 'text'],
            services: ['tabs'],
            menu: ['grouped', 'simple'],
            gallery: ['masonry', 'grid', 'carousel'],
            team: ['cards', 'grid'],
            testimonials: ['quotes', 'cards'],
            faq: ['accordion', 'two-column'],
            contact: ['split-map', 'form', 'simple'],
            footer: ['columns', 'simple'],
        },
    },
    motion: {
        moods: [MOODS.luxe, MOODS.slate, MOODS.voltage],
        motions: ['kinetic', 'showcase'],
        sections: {
            // Both variants render full-bleed via MOTION_CSS (image-bg must not become an inset card).
            hero: ['image-bg', 'centred'],
            about: ['text', 'media-split'],
            services: ['timeline', 'cards', 'grid'],
            gallery: ['carousel', 'masonry'],
            testimonials: ['cards', 'quotes'],
            faq: ['accordion'],
            contact: ['form', 'simple'],
            footer: ['columns'],
        },
    },
};

/**
 * FNV-1a. Small, dependency-free, and stable across runs and machines -- which matters
 * because the same business asking twice must get the same site back, and a test has to be
 * able to assert what it will get.
 */
function hash(seed: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }

    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b) >>> 0;
    h ^= h >>> 16;

    return h >>> 0;
}

/**
 * A different draw per facet, so two businesses whose seeds hash close together do not end
 * up with the same five choices. Salting by facet name decorrelates them.
 */
function pick<T>(pool: readonly T[], seed: string, facet: string): T {
    if (pool.length === 0) throw new Error(`art-variety: empty pool for ${facet}`);
    return pool[hash(`${seed}:${facet}`) % pool.length]!;
}

/** Everything that identifies this build, so the draw is stable but not shared. */
export function artSeed(parts: { title?: string; vertical?: string; jobId?: string }): string {
    return [parts.title ?? '', parts.vertical ?? '', parts.jobId ?? ''].join('|').toLowerCase();
}

export function variedArtDirection(styleId: StyleId, seed: string): ArtDirection {
    const palette = PALETTES[styleId];
    const mood = pick(palette.moods, seed, 'mood');

    return {
        themeId: mood.themeId,
        motionId: pick(palette.motions, seed, 'motion'),
        radiusId: mood.radiusId,
        spacingId: mood.spacingId,
        imageryId: mood.imageryId,
    };
}

export function variedVariants(
    styleId: StyleId,
    seed: string,
): Partial<Record<SectionKey, string>> {
    const palette = PALETTES[styleId];
    const out: Partial<Record<SectionKey, string>> = {};

    for (const [section, pool] of Object.entries(palette.sections)) {
        const key = section as SectionKey;
        const known = VARIANTS[key];
        // A pool entry the renderer does not know would render as the section's default and
        // quietly undo the variety it was added for.
        const usable = known ? pool.filter((v) => known.includes(v)) : [];
        if (usable.length === 0) continue;
        out[key] = pick(usable, seed, `section:${section}`);
    }

    return out;
}

/** The spec as written, with its fixed art and layout replaced by this business's draw. */
export function variedSpec(spec: StyleSpec, seed: string): StyleSpec {
    if (!seed) return spec;

    return {
        ...spec,
        art: variedArtDirection(spec.id, seed),
        variants: { ...spec.variants, ...variedVariants(spec.id, seed) },
    };
}

/** How many distinct sites a tier can produce, for the claim on the pricing page. */
export function paletteSize(styleId: StyleId): number {
    const p = PALETTES[styleId];
    const art = p.moods.length * p.motions.length;
    const layout = Object.entries(p.sections).reduce((total, [section, pool]) => {
        const known = VARIANTS[section as SectionKey];
        const usable = known ? pool.filter((v) => known.includes(v)).length : 0;
        return usable > 0 ? total * usable : total;
    }, 1);

    return art * layout;
}
