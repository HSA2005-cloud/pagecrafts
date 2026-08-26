import { describe, expect, it } from 'vitest';

import { applyStyle, STYLE_SPECS, STYLE_IDS } from '@/lib/ai/generate/styles';
import { buildStyleOptions } from '@/lib/ai/generate/options';
import {
    bankPhotoUrl,
    CLOTHING_PHOTO_ID,
    DESSERT_PHOTO_ID,
    MITHAI_SEARCH,
    photoSearchQuery,
    stampPhotoUrls,
} from '@/lib/ai/generate/photos';

// The body attribute, not the first data-motion in the file — motionCss opens with a
// `[data-motion="none"]` rule, so a loose match reads the stylesheet instead of the page.
const bodyMotion = (html: string) => html.match(/<body[^>]*data-motion="([a-z]+)"/)?.[1] ?? '';
const heroVariant = (html: string) =>
    html.match(/data-type="hero" data-variant="([a-z-]+)"/)?.[1] ?? '';
const aboutVariant = (html: string) =>
    html.match(/data-type="about" data-variant="([a-z-]+)"/)?.[1] ?? '';
import { SCHEMA_VERSION, type ArtDirection, type Composition, type SectionInstance } from '@/lib/contracts';

const ART: ArtDirection = {
    themeId: 'calm-sage', motionId: 'whisper', radiusId: 'soft',
    spacingId: 'airy', imageryId: 'warm-natural',
};

const section = (
    id: string,
    type: SectionInstance['type'],
    variant: string,
    props: Record<string, unknown>,
): SectionInstance => ({
    id, type, variant, brief: 'b', visible: true, locked: false, source: 'ai', props,
});

const composition: Composition = {
    schemaVersion: SCHEMA_VERSION,
    vertical: 'sweet-shop',
    artDirection: ART,
    meta: { title: 'Mithas Sweets', description: 'A sweet shop in Old Delhi', lang: 'en' },
    sections: [
        section('s_01', 'hero', 'split-image', {
            heading: 'Mithas Sweets',
            image: { query: 'indian sweets mithai', alt: 'Trays of mithai' },
        }),
        section('s_02', 'about', 'text', {
            heading: 'About',
            body: 'Family recipes.',
            image: { query: 'sweet shop counter', alt: 'The counter' },
        }),
        section('s_03', 'menu', 'simple', {
            heading: 'What we make',
            items: [{ name: 'Laddu', description: 'Besan.', price: 'Varies' }],
        }),
        section('s_04', 'contact', 'simple', { heading: 'Visit', blurb: 'Chandni Chowk.' }),
        section('s_05', 'footer', 'simple', { tagline: 'Mithas Sweets' }),
    ],
};

describe('style presets — three looks from one brief', () => {
    it('ships starter, pro and premium (ids casual / photos / motion)', () => {
        expect(STYLE_IDS).toEqual(['casual', 'photos', 'motion']);
        expect(STYLE_SPECS.casual.tier).toBe('free');
        expect(STYLE_SPECS.photos.tier).toBe('pro');
        expect(STYLE_SPECS.motion.tier).toBe('premium');
    });

    it('keeps the copy and changes the look', () => {
        const photos = applyStyle(composition, STYLE_SPECS.photos);
        expect(photos.sections.find((s) => s.type === 'hero')?.props.heading).toBe('Mithas Sweets');
        expect(photos.artDirection.themeId).not.toBe(STYLE_SPECS.casual.art.themeId);
        expect(photos.artDirection.motionId).not.toBe(STYLE_SPECS.motion.art.motionId);
        expect(photos.sections.find((s) => s.type === 'hero')?.variant).toBe('image-bg');
        expect(applyStyle(composition, STYLE_SPECS.casual).sections.find((s) => s.type === 'hero')?.variant)
            .toBe('split-image');
        expect(applyStyle(composition, STYLE_SPECS.casual).artDirection.themeId).toBe('sunlit-craft');
        expect(applyStyle(composition, STYLE_SPECS.motion).artDirection.motionId).toBe('kinetic');
    });

    it('picks a mithai photograph for a sweets query', () => {
        expect(bankPhotoUrl('indian sweets mithai')).toContain(DESSERT_PHOTO_ID);
        expect(bankPhotoUrl('indian sweets mithai')).not.toBe(bankPhotoUrl('a gym in koramangala'));
    });

    it('does not use a clothing shop photo for a sweet shop, even if the slot says shop interior', async () => {
        const shoppy = {
            ...composition,
            sections: composition.sections.map((section) =>
                section.type === 'hero'
                    ? { ...section, props: { ...section.props, image: { query: 'shop interior', alt: 'Store' } } }
                    : section,
            ),
        };
        const search = photoSearchQuery(shoppy.vertical, shoppy.meta.title, 'shop interior');
        expect(search).toBe(MITHAI_SEARCH);
        expect(bankPhotoUrl(search)).toContain(DESSERT_PHOTO_ID);
        expect(bankPhotoUrl(search)).not.toContain(CLOTHING_PHOTO_ID);

        const stamped = await stampPhotoUrls(shoppy);
        const heroImage = stamped.sections.find((section) => section.type === 'hero')?.props.image as { url?: string };
        expect(heroImage.url).toContain(DESSERT_PHOTO_ID);
        expect(heroImage.url).not.toContain(CLOTHING_PHOTO_ID);

        expect(bankPhotoUrl('saree boutique dresses')).toContain(CLOTHING_PHOTO_ID);
    });

    it('builds three finished sites; Casual gets one hero photo, Photo-rich gets photos throughout', async () => {
        const options = await buildStyleOptions(composition);
        expect(options.map((o) => o.id)).toEqual(['casual', 'photos', 'motion']);
        expect(options.map((o) => o.label)).toEqual(['Casual', 'Photo-rich', 'Animated']);

        const home = Object.fromEntries(options.map((o) => [o.id, o.files['index.html'] ?? '']));
        const about = Object.fromEntries(options.map((o) => [o.id, o.files['about.html'] ?? '']));
        const allHtml = Object.fromEntries(
            options.map((o) => [o.id, Object.values(o.files).join('\n')]),
        );

        expect(home.casual).toContain('data-style="casual"');
        expect(home.photos).toContain('data-style="photos"');
        expect(home.motion).toContain('data-style="motion"');

        // Casual shows one hero photograph in a split layout (not a grey wall of type).
        expect(home.casual).toContain('images.unsplash.com');
        expect(home.casual).toContain('<img src="');
        // The layout is drawn per business now, so the assertion is the tier's pool rather
        // than one variant. Every Photo-rich site sharing one hero was the thing the Rs 499
        // tier is sold as not doing.
        expect(['split-image', 'centred', 'minimal']).toContain(heroVariant(home.casual));
        expect(home.casual).toContain('site-header');
        // About lives on about.html after the multi-page split.
        expect(['text', 'media-split']).toContain(aboutVariant(about.casual));
        // Photo-rich goes further: cinematic hero + more photos site-wide.
        expect(home.photos).toContain('images.unsplash.com');
        expect(['image-bg', 'split-image', 'centred']).toContain(heroVariant(home.photos));
        expect(['media-split', 'text']).toContain(aboutVariant(about.photos));
        expect((allHtml.photos.match(/images\.unsplash\.com/g) ?? []).length)
            .toBeGreaterThan((allHtml.casual.match(/images\.unsplash\.com/g) ?? []).length);
        // Each tier keeps its character while it varies: quiet stays quiet, kinetic stays
        // in motion. What must never happen is Casual animating like Animated.
        expect(['none', 'whisper']).toContain(bodyMotion(home.casual));
        expect(['whisper', 'calm', 'editorial', 'showcase']).toContain(bodyMotion(home.photos));
        expect(['kinetic', 'showcase', 'editorial']).toContain(bodyMotion(home.motion));
        expect(home.motion).toContain('motion-stage');
        expect(home.motion).toContain('jalebi-coil');
        expect(home.casual).not.toContain('motion-stage');
        expect(home.photos).not.toContain('motion-stage');
        expect(home.casual).toContain('Mithas Sweets');
        expect(home.photos).toContain('Mithas Sweets');
        expect(home.motion).toContain('Mithas Sweets');
    });
});
