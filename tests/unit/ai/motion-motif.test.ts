import { describe, expect, it } from 'vitest';

import { motifFor, motionMotifMarkup, motionStageMarkup, motionTickerMarkup } from '@/lib/ai/generate/motion-motif';
import { compositionToFiles } from '@/lib/ai/generate/to-files';
import { SCHEMA_VERSION, type ArtDirection, type Composition, type SectionInstance } from '@/lib/contracts';

const ART: ArtDirection = {
    themeId: 'vivid-energy', motionId: 'kinetic', radiusId: 'pill',
    spacingId: 'tight', imageryId: 'bold-contrast',
};

describe('motion motif follows the business', () => {
    it('spins a jalebi for a mithai shop, not abstract orbs', () => {
        expect(motifFor('sweet-shop', 'Sweetshop in Pune')).toBe('jalebi');
        const html = motionMotifMarkup('sweet-shop', 'Sweetshop');
        expect(html).toContain('data-motif="jalebi"');
        expect(html).toContain('jalebi-coil');
        expect(html).toContain('honey-drip');
    });

    it('bounces a tooth for a dental clinic', () => {
        expect(motifFor('dental-clinic', 'Smile Dental')).toBe('tooth');
        expect(motionMotifMarkup('dental-clinic')).toContain('data-motif="tooth"');
    });

    it('picks a motif from the business, not a leftover orb', () => {
        expect(motifFor('law-firm', 'Property and family')).toBe('scale');
        expect(motifFor('yoga-studio')).toBe('leaf');
        expect(motifFor('music-school')).toBe('note');
        expect(motifFor('veterinary-clinic')).toBe('paw');
        expect(motifFor('hospital')).toBe('needle');
        expect(motifFor('driving-school')).toBe('wheel');
        expect(motifFor('architecture-studio')).toBe('building');
        expect(motifFor('logistics', 'Packers and movers')).toBe('crate');
        expect(motifFor('university')).toBe('cap');
        expect(motifFor('ngo', 'Donate and volunteer')).toBe('heart');
        expect(motifFor('wedding-planner')).toBe('flower');
        expect(motifFor('electrician')).toBe('bolt');
        expect(motifFor('accountant')).toBe('coin');
        expect(motifFor('physiotherapy')).toBe('needle');
        expect(motifFor('saree-shop')).toBe('drape');
        expect(motifFor('gym')).toBe('flame');
        expect(motifFor('bakery', 'birthday cakes')).toBe('jalebi');
        expect(motifFor('confectionery', 'kaju katli')).toBe('jalebi');
        expect(motifFor('personal-trainer', 'sessions')).toBe('flame');
        expect(motifFor('unspecified', 'a website')).toBe('none');
        expect(motionMotifMarkup('unspecified')).toBe('');
    });

    // A restaurant hero is a photograph of food, and the steam glyph sat on top of it as a
    // large translucent line drawing — closer to a smudge on the lens than to decoration.
    // Food businesses get no motif; the picture is already the decoration.
    it('leaves a food business alone', () => {
        for (const vertical of [
            'restaurant',
            'cafe',
            'fine-dining',
            'south-indian-breakfast',
            'food-truck',
        ]) {
            expect(motifFor(vertical), vertical).toBe('none');
            expect(motionMotifMarkup(vertical), vertical).toBe('');
        }

        expect(motifFor('south-indian-breakfast', 'dosa and idli')).toBe('none');
        expect(motifFor('restaurant', 'fine dining in Bengaluru')).toBe('none');
    });

    // Sweets keep theirs. A jalebi coil over a tray of mithai is the shop's own iconography,
    // not a generic food glyph, and nobody complained about it.
    it('still gives a sweet shop its jalebi', () => {
        expect(motifFor('sweet-shop')).toBe('jalebi');
        expect(motifFor('bakery', 'birthday cakes')).toBe('jalebi');
    });

    it('builds a kinetic stage and ticker, separate from the motif', () => {
        expect(motionStageMarkup()).toContain('class="motion-stage"');
        expect(motionStageMarkup()).toContain('motion-aurora');
        expect(motionTickerMarkup('Mithas Sweets')).toContain('Mithas Sweets');
        expect(motionTickerMarkup('<script>')).toContain('&lt;script&gt;');
        expect(motionTickerMarkup('<script>')).not.toContain('<script>');
    });

    it('renders the Animated look with kinetic motifs for the business', () => {
        const section = (
            id: string,
            type: SectionInstance['type'],
            props: Record<string, unknown>,
        ): SectionInstance => ({
            id, type, variant: 'centred', brief: 'b', visible: true, locked: false, source: 'ai', props,
        });
        const composition: Composition = {
            schemaVersion: SCHEMA_VERSION,
            vertical: 'dental-clinic',
            artDirection: ART,
            meta: { title: 'Smile Dental', description: 'Family dentistry', lang: 'en' },
            sections: [
                section('s_01', 'hero', { heading: 'Family dentistry', ctaLabel: 'Book' }),
                section('s_02', 'footer', { tagline: 'Smile Dental' }),
            ],
        };
        const motion = compositionToFiles(composition, 'motion')['index.html'] ?? '';
        const casual = compositionToFiles(composition, 'casual')['index.html'] ?? '';
        expect(motion).toContain('data-style="motion"');
        expect(motion).toContain('class="motion-stage"');
        expect(motion).toContain('data-motif="tooth"');
        expect(motion).toContain('Smile Dental');
        expect(casual).toContain('data-style="casual"');
        expect(casual).toContain('site-header');
        expect(casual).not.toContain('class="motion-motif"');
        expect(casual).not.toContain('data-motif="tooth"');
    });
});
