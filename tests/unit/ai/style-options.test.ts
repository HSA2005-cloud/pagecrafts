import { describe, expect, it } from 'vitest';

import { applyStyle, STYLE_SPECS, STYLE_IDS } from '@/lib/ai/generate/styles';
import { buildStyleOptions } from '@/lib/ai/generate/options';
import {
    bankPhotoUrl,
    CLOTHING_PHOTO_ID,
    DESSERT_PHOTO_ID,
    MITHAI_SEARCH,
    photoKeyFromUrl,
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
            .toBe('centred');
        expect(applyStyle(composition, STYLE_SPECS.casual).artDirection.themeId).toBe('sunlit-craft');
        expect(applyStyle(composition, STYLE_SPECS.motion).artDirection.motionId).toBe('kinetic');
    });

    it('picks a mithai photograph for a sweets query', () => {
        expect(bankPhotoUrl('indian sweets mithai')).toContain(DESSERT_PHOTO_ID);
        expect(bankPhotoUrl('indian sweets mithai')).not.toBe(bankPhotoUrl('a gym in koramangala'));
    });

    it('never stamps bakery bread on a travel / nature / vlog brief', async () => {
        const { BAKERY_SHELF_PHOTO_ID } = await import('@/lib/ai/generate/photos');
        const travelQuery = photoSearchQuery(
            'travel-vlog',
            'Pragna Travel Vlogs',
            'hero',
            'Explore nature videos, share your journeys, connect with fellow viewers.',
        );
        expect(travelQuery.toLowerCase()).toMatch(/nature|travel|journey/);
        expect(bankPhotoUrl(travelQuery, 'job_travel_1')).not.toContain(BAKERY_SHELF_PHOTO_ID);
        expect(bankPhotoUrl(travelQuery, 'job_travel_1')).not.toMatch(
            /photo-1509440159596-0249088772ff|photo-1555507036|photo-1414235077428|photo-1504674900247/,
        );

        const travelSite = {
            ...composition,
            vertical: 'travel-vlog',
            meta: {
                ...composition.meta,
                title: 'Pragna Travel Vlogs',
                description: 'Explore nature videos, share your journeys, connect with fellow viewers.',
            },
        };
        const stamped = await stampPhotoUrls(travelSite);
        const heroImage = stamped.sections.find((section) => section.type === 'hero')?.props.image as { url?: string };
        expect(heroImage.url).toMatch(/images\.unsplash\.com\/photo-/);
        expect(heroImage.url).not.toContain(BAKERY_SHELF_PHOTO_ID);
    });

    it('never stamps known-dead Unsplash ids, and hospital briefs get clinic photos', () => {
        // These used to 404 on images.unsplash.com — Pick a look showed beige boxes + alt text.
        const dead = [
            'photo-1631217868264-e5b90bb7e629',
            'photo-1424847653812-7ad6b33ea746',
            'photo-1540189549336-e9fb1f3a1e3d',
            'photo-1486427944299-d1955d23fd34',
            'photo-1571902943202-507c674acf4a',
            'photo-1501785888041-af3bc6ed3cfa',
        ];
        const samples = [
            bankPhotoUrl('hospital neurosurgery bangalore', 'job_a'),
            bankPhotoUrl('Preethi Brain Surgery clinic', 'job_b'),
            bankPhotoUrl('chinese restaurant fine dining', 'job_c'),
            bankPhotoUrl('bakery bread pastry', 'job_d'),
            bankPhotoUrl('gym fitness yoga', 'job_e'),
            bankPhotoUrl('travel vlog nature journey', 'job_f'),
        ];
        for (const url of samples) {
            for (const id of dead) {
                expect(url).not.toContain(id);
            }
        }
        expect(bankPhotoUrl('hospital neurosurgery bangalore', 'job_a')).toMatch(
            /photo-1519494026892-80bbd2d6fd0d|photo-1516549655169-df83a0774514|photo-1579684385127-1ef15d508118|photo-1586773860418-d37222d8fce3|photo-1666214280557-f1b5022eb634/,
        );
    });

    it('stamps tech / device photos for technology briefs, never gym dumbbells', () => {
        const techQuery = 'Smart Technology Company Nexora Smart Technology Smart home integration devices';
        const photo = bankPhotoUrl(techQuery, 'job_tech_1');
        // Must match tech pool
        expect(photo).toMatch(/photo-1518770660439|photo-1531297484001|photo-1550751827|photo-1526374965328|photo-1519389950473|photo-1581091226825|photo-1558494949|photo-1451187580459|photo-1504384308090|photo-1525547719571/);
        // Must NOT match gym dumbbells or food
        expect(photo).not.toMatch(/photo-1534438327276|photo-1509440159596|photo-1551024506/);
    });

    it('gives Set 1 and Set 2 different restaurant heroes when salted by job id', () => {
        const query = 'chinese restaurant fine dining bangalore';
        const set1 = bankPhotoUrl(query, 'job_set_1');
        const set2 = bankPhotoUrl(query, 'job_set_2');
        expect(set1).toMatch(/images\.unsplash\.com\/photo-/);
        expect(set2).toMatch(/images\.unsplash\.com\/photo-/);
        expect(set1).not.toBe(set2);
        // Same set again is stable.
        expect(bankPhotoUrl(query, 'job_set_1')).toBe(set1);
    });

    it('never reuses a Set 1 hero when that photo is excluded for Set 2', () => {
        const query = 'chinese restaurant fine dining bangalore';
        const set1 = bankPhotoUrl(query, 'job_set_1');
        const used = new Set([photoKeyFromUrl(set1)]);
        // Even with the same salt that would have picked set1, exclude forces another.
        const set2 = bankPhotoUrl(query, 'job_set_1', used);
        expect(set2).not.toBe(set1);
        expect(photoKeyFromUrl(set2)).not.toBe(photoKeyFromUrl(set1));
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

        // Casual shows one hero photograph, centre-oriented in the viewport.
        expect(home.casual).toContain('images.unsplash.com');
        expect(home.casual).toContain('<img src="');
        expect(['centred', 'split-image', 'minimal']).toContain(heroVariant(home.casual));
        expect(home.casual).toContain('site-header');
        expect(home.casual).toMatch(/min-height:\s*min\(88(?:svh|dvh)/);
        // Fully centre-paged on phone, tablet, and laptop — never top-aligned.
        expect(home.casual).toMatch(/justify-content:\s*safe center/);
        expect(home.casual).toMatch(/\[data-type="about"\][\s\S]*min-height:\s*min\(70(?:svh|dvh)/);
        expect(home.casual).toMatch(/@media \(min-width:\s*48\.01rem\) and \(max-width:\s*64rem\)/);
        expect(home.casual).toMatch(/@media \(max-width:\s*48rem\)[\s\S]*min-height:\s*calc\(100svh/);
        expect(home.casual).toMatch(/min-height:\s*min\(80svh/);
        expect(home.casual).not.toMatch(/\[data-style="casual"\] main[\s\S]{0,200}justify-content:\s*flex-start/);
        expect(home.casual).not.toMatch(/@media \(max-width:\s*48rem\)[\s\S]*justify-content:\s*flex-start/);
        // About still has a page on Starter / Pro multi-page sites.
        expect(['text', 'media-split']).toContain(aboutVariant(about.casual));
        // Photo-rich: cinematic hero + full-site topic photograph + page transitions.
        expect(home.photos).toContain('images.unsplash.com');
        expect(home.photos).toContain('--page-photo');
        expect(home.photos).toContain('pc-page-ready');
        expect(home.photos).toContain('--pc-bg-shift');
        expect(home.photos).toContain('scale(1.06)');
        expect(heroVariant(home.photos)).toBe('image-bg');
        expect(home.photos).toMatch(/\[data-style="photos"\] \[data-type="hero"\][\s\S]*?min-height:\s*100svh/);
        expect(home.photos).toMatch(/\[data-style="photos"\] main[\s\S]*?padding-inline:\s*0/);
        expect(['media-split', 'text']).toContain(aboutVariant(about.photos));
        expect((allHtml.photos.match(/images\.unsplash\.com/g) ?? []).length)
            .toBeGreaterThan((allHtml.casual.match(/images\.unsplash\.com/g) ?? []).length);
        // Premium is a continuous scroll deck (like pagecrafts.in), not multi-page.
        expect(home.motion).toContain('site-liquid');
        expect(home.motion).toContain('liquid-deck');
        expect(home.motion).toContain('liquid-slide');
        expect(home.motion).toMatch(/min-height:\s*100svh/);
        expect(home.motion).toMatch(/@media \(max-width:\s*48rem\)[\s\S]*min-height:\s*100svh/);
        expect(home.motion).toContain('href="#about"');
        expect(options.find((o) => o.id === 'motion')?.files['about.html']).toBeUndefined();
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
