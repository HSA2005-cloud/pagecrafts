import { describe, expect, it } from 'vitest';

import { MAX_CLASSIFY_CHARS } from '@/lib/contracts';
import {
    briefErrors, briefFromQuery, composeBrief, emptyBrief, projectNameFromBrief, type SiteBrief,
} from '@/lib/ai/generate/brief';

function brief(over: Partial<SiteBrief>): SiteBrief {
    return { ...emptyBrief(), ...over };
}

describe('site brief — enough facts to generate a real page', () => {
    it('refuses a one-liner with no name, profession, place or offering', () => {
        expect(briefErrors(emptyBrief())).toEqual([
            'What is the business called?',
            'What profession or trade is this — dentist, bakery, plumber…?',
            'What do they do? A shop, a clinic, the services.',
            'Where is it — a city or neighbourhood?',
        ]);
        expect(briefErrors(brief({ offer: 'a sweet shop' }))).toHaveLength(3);
    });

    it('writes a grounded description a dentist, a baker and a plumber can all use', () => {
        const dental = composeBrief(brief({
            name: 'Smile Dental',
            profession: 'Dentist',
            offer: 'family dental clinic doing check-ups, root canals and braces',
            place: 'Koramangala',
            phone: '080 1234 5678',
            extra: 'people should be able to book an appointment',
        }));
        expect(dental).toMatch(/^Profession field: Dentist\b/);
        expect(dental).toContain('Smile Dental');
        expect(dental).toContain('Koramangala');
        expect(dental).toContain('braces');
        expect(dental).toContain('080 1234 5678');
        expect(dental).toContain('book an appointment');
        expect(dental.length).toBeLessThanOrEqual(MAX_CLASSIFY_CHARS);

        const bakery = composeBrief(brief({
            name: 'Rise',
            profession: 'Bakery',
            offer: 'home bakery, custom birthday cakes brownies and cupcakes',
            place: 'Indiranagar',
            hours: 'orders on WhatsApp',
        }));
        expect(bakery).toContain('Profession field: Bakery');
        expect(bakery).toContain('Rise');
        expect(bakery).toContain('Indiranagar');
        expect(bakery).toContain('cupcakes');
        expect(bakery).toContain('WhatsApp');
        expect(bakery).not.toContain('braces');

        const plumber = composeBrief(brief({
            name: 'Pune Plumbing',
            profession: 'Plumber',
            offer: 'emergency callouts, leak repairs and bathroom fittings',
            place: 'Pune',
            extra: '24/7',
        }));
        expect(plumber).toContain('Profession field: Plumber');
        expect(plumber).toContain('Pune');
        expect(plumber).toContain('24/7');
        expect(plumber).not.toContain('cupcakes');
    });

    it('tags Medical first so Brain Surgery stays specialty, not the whole category', () => {
        const text = composeBrief(brief({
            name: 'Brain Surgery',
            profession: 'Medical',
            offer: 'neurosurgery consultations and operations',
            place: 'Bangalore',
        }));
        expect(text.indexOf('Profession field: Medical')).toBe(0);
        expect(text).toContain('Brain Surgery');
        expect(text).toMatch(/Medical work specific to Brain Surgery/i);
        // Truncating like the runner still leaves the profession tag + title.
        const stamped = text.slice(0, 160);
        expect(stamped).toContain('Profession field: Medical');
        expect(stamped).toContain('Brain Surgery');
    });

    it('names the project after the business, not the whole paragraph', () => {
        expect(projectNameFromBrief(brief({
            name: 'Mithas Sweets',
            offer: 'kaju katli and laddu',
            place: 'Old Delhi',
        }))).toBe('Mithas Sweets');
    });

    it('restores a gallery one-liner into the offering field', () => {
        expect(briefFromQuery('a yoga studio in jayanagar').offer)
            .toBe('a yoga studio in jayanagar');
        expect(briefFromQuery('a yoga studio in jayanagar').name).toBe('');
    });

    it('stays inside the classify ceiling even when every field is long', () => {
        const text = composeBrief(brief({
            name: 'A'.repeat(80),
            profession: 'G'.repeat(80),
            offer: 'B'.repeat(200),
            place: 'C'.repeat(80),
            phone: 'D'.repeat(40),
            hours: 'E'.repeat(80),
            extra: 'F'.repeat(200),
        }));
        expect(text.length).toBeLessThanOrEqual(MAX_CLASSIFY_CHARS);
    });
});
