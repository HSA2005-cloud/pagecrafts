import type { ArtDirection, Composition, SectionKey } from '@/lib/contracts';

export const STYLE_IDS = ['casual', 'photos', 'motion'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

/** Product plans. Casual is free to use; Pro and Premium looks need account Pro. */
export const STYLE_TIERS = ['free', 'pro', 'premium'] as const;
export type StyleTier = (typeof STYLE_TIERS)[number];

export interface StyleSpec {
    id: StyleId;
    label: string;
    blurb: string;
    tier: StyleTier;
    priceInr: number;
    art: ArtDirection;
    /** Layout variant overrides, applied when that section exists. */
    variants: Partial<Record<SectionKey, string>>;
    /** Stamp real photographs into image slots. `'hero'` = hero only (Casual). */
    photos: boolean | 'hero';
}

/**
 * Three looks from one brief.
 *
 * Casual is the free default: warm colour, one hero photograph, still simple —
 * not a grey wall of type, and not the full cinematic Photo-rich look. Photos is
 * Pro: full-bleed imagery throughout. Motion is Premium: colour and scroll
 * animation. Same words, three different sites — so a sweet shop is not one
 * generic page, it is a choice.
 */
export const STYLE_SPECS: Record<StyleId, StyleSpec> = {
    casual: {
        id: 'casual',
        label: 'Casual',
        blurb: 'Simple, colourful, and a little inviting — one photo up top, no heavy gallery.',
        tier: 'free',
        priceInr: 0,
        art: {
            themeId: 'sunlit-craft',
            motionId: 'none',
            radiusId: 'soft',
            spacingId: 'default',
            imageryId: 'bright-clean',
        },
        variants: {
            // Centre-first Starter: words and the one photo sit in the middle of the viewport.
            hero: 'centred',
            about: 'text',
            services: 'cards',
            menu: 'simple',
            contact: 'simple',
            footer: 'simple',
        },
        photos: 'hero',
    },
    photos: {
        id: 'photos',
        label: 'Photo-rich',
        blurb: 'Editorial type, a cinematic hero, and real photographs throughout the page.',
        tier: 'pro',
        priceInr: 499,
        art: {
            themeId: 'warm-editorial',
            motionId: 'editorial',
            radiusId: 'organic',
            spacingId: 'airy',
            imageryId: 'warm-natural',
        },
        variants: {
            hero: 'image-bg',
            about: 'media-split',
            services: 'cards',
            menu: 'grouped',
            gallery: 'masonry',
            contact: 'split-map',
            footer: 'columns',
        },
        photos: true,
    },
    motion: {
        id: 'motion',
        label: 'Animated',
        blurb: 'A kinetic canvas — Bodoni display type, champagne gold, and motion drawn from this business.',
        tier: 'premium',
        priceInr: 999,
        art: {
            themeId: 'deep-luxury',
            motionId: 'kinetic',
            radiusId: 'framed',
            spacingId: 'airy',
            imageryId: 'warm-natural',
        },
        variants: {
            hero: 'centred',
            about: 'text',
            services: 'timeline',
            faq: 'accordion',
            contact: 'form',
            footer: 'columns',
        },
        // 'hero', not false. False meant the premium tier never fetched a photograph at
        // all, so it sold a glowing SVG while the free tier showed a real room. The hero
        // photo is the whole composition now; the rest of the page stays type and motion,
        // which is what separates this from Photo-rich.
        photos: 'hero',
    },
};

export function cloneComposition(composition: Composition): Composition {
    return structuredClone(composition);
}

/** Restyle a composition into one of the three looks. Copy stays the same. */
export function applyStyle(composition: Composition, spec: StyleSpec): Composition {
    const next = cloneComposition(composition);
    next.artDirection = spec.art;
    next.sections = next.sections.map((section) => ({
        ...section,
        variant: spec.variants[section.type] ?? section.variant,
    }));
    return next;
}
