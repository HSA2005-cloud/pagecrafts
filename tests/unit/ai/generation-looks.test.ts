import { describe, expect, it } from 'vitest';

import { motifFor } from '@/lib/ai/generate/motion-motif';
import { buildStyleOptions } from '@/lib/ai/generate/options';
import { DESSERT_PHOTO_ID } from '@/lib/ai/generate/photos';
import { SCHEMA_VERSION, type ArtDirection, type Composition, type SectionInstance } from '@/lib/contracts';

const ART: ArtDirection = {
    themeId: 'calm-sage', motionId: 'whisper', radiusId: 'soft',
    spacingId: 'airy', imageryId: 'warm-natural',
};

// The body attribute, not the first data-motion in the file — motionCss opens with a
// `[data-motion="none"]` rule, so a loose match reads the stylesheet instead of the page.
const motionOf = (html: string) => html.match(/<body[^>]*data-motion="([a-z]+)"/)?.[1] ?? '';

const CASES = [
    { vertical: 'sweet-shop', extra: 'Mithas Sweets in Old Delhi', motif: 'jalebi', heading: 'Mithas Sweets' },
    { vertical: 'confectionery', extra: 'kaju katli motichoor laddu', motif: 'jalebi', heading: 'Fresh mithai' },
    { vertical: 'bakery', extra: 'birthday cakes brownies cupcakes', motif: 'jalebi', heading: 'Indiranagar bakery' },
    { vertical: 'dental-clinic', extra: 'Family dentistry in Koramangala', motif: 'tooth', heading: 'Smile Dental' },
    { vertical: 'gym', extra: 'boutique gym class packages', motif: 'flame', heading: 'Iron Yard' },
    { vertical: 'law-firm', extra: 'property and family matters', motif: 'scale', heading: 'Rao & Co' },
    { vertical: 'restaurant', extra: 'south indian breakfast in jayanagar', motif: 'none', heading: 'Idli House' },
    { vertical: 'south-indian-breakfast', extra: 'dosa idli filter coffee', motif: 'none', heading: 'Breakfast room' },
    { vertical: 'yoga-studio', extra: 'class timings and a bit about me', motif: 'leaf', heading: 'Still Point' },
    { vertical: 'saree-shop', extra: 'silk saree shop in kanchipuram', motif: 'drape', heading: 'Komala Silks' },
    { vertical: 'silk-saree-shop', extra: 'wedding sarees three generations', motif: 'drape', heading: 'Kanchi Silks' },
    { vertical: 'music-school', extra: 'piano and guitar lessons', motif: 'note', heading: 'Scale Academy' },
    { vertical: 'veterinary-clinic', extra: 'dogs cats and small birds', motif: 'paw', heading: 'Vashi Vet' },
    { vertical: 'electrician', extra: 'wiring and emergency callouts', motif: 'bolt', heading: 'Spark Co' },
    { vertical: 'plumber', extra: 'emergency leak repairs in pune', motif: 'none', heading: 'Pune Plumbing' },
] as const;

function section(
    id: string,
    type: SectionInstance['type'],
    props: Record<string, unknown>,
): SectionInstance {
    return { id, type, variant: 'centred', brief: 'b', visible: true, locked: false, source: 'ai', props };
}

function compositionFor(vertical: string, heading: string, extra: string): Composition {
    return {
        schemaVersion: SCHEMA_VERSION,
        vertical,
        artDirection: ART,
        meta: { title: heading, description: extra, lang: 'en' },
        sections: [
            section('s_01', 'hero', {
                heading,
                sub: extra,
                ctaLabel: 'Visit us',
                image: { query: 'shop interior', alt: 'Interior' },
            }),
            section('s_02', 'about', { heading: 'About', body: extra }),
            section('s_03', 'contact', { heading: 'Visit', blurb: extra }),
            section('s_04', 'footer', { tagline: heading }),
        ],
    };
}

describe('three looks stay on-brief for any vertical', () => {
    it.each(CASES)('$vertical keeps motif mapping and an Animated kinetic page', async (c) => {
        expect(motifFor(c.vertical, c.extra), c.vertical).toBe(c.motif);

        const options = await buildStyleOptions(compositionFor(c.vertical, c.heading, c.extra));
        expect(options.map((o) => o.id)).toEqual(['casual', 'photos', 'motion']);

        const html = Object.fromEntries(options.map((o) => [o.id, o.files['index.html'] ?? '']));

        expect(html.casual).toContain(c.heading);
        expect(html.photos).toContain(c.heading);
        expect(html.motion).toContain(c.heading);

        expect(html.casual).toContain('data-style="casual"');
        // Was data-motion="none" exactly. Every site in the product shared one art
        // direction, which is what the Rs 499 tier is sold as not doing. The tier still has
        // to read as quiet, so the assertion moved from one token to the tier's pool.
        expect(['none', 'whisper']).toContain(motionOf(html.casual));
        expect(html.casual).toContain('images.unsplash.com');
        expect(html.casual).toContain('<img src="');
        expect(html.casual).toContain('site-header');
        expect(html.casual).not.toContain('motion-stage');

        expect(html.photos).toContain('data-style="photos"');
        expect(html.photos).toContain('<img src="');
        expect(html.photos).toContain('images.unsplash.com');
        expect(html.photos).not.toContain('motion-stage');

        expect(html.motion).toContain('data-style="motion"');
        // Animated may draw kinetic, showcase or editorial. What it must never be is still.
        expect(['kinetic', 'showcase', 'editorial']).toContain(motionOf(html.motion));
        expect(html.motion).toContain('motion-stage');
        expect(html.motion).not.toContain('pc-orb');
        if (c.motif !== 'none') {
            expect(html.motion).toContain(`data-motif="${c.motif}"`);
        }
    });

    it('does not stamp a mithai photograph onto a gym', async () => {
        const gym = await buildStyleOptions(compositionFor('gym', 'Iron Yard', 'boutique gym'));
        const photos = gym.find((o) => o.id === 'photos');
        expect(photos?.files['index.html']).toContain('images.unsplash.com');
        expect(photos?.files['index.html']).not.toContain(DESSERT_PHOTO_ID);
    });
});
