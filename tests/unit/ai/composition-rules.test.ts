import { describe, it, expect } from 'vitest';
import { normalisePlan, isPersonalSite, wantsFirstPersonAbout, wantsPricing, type NormalisedPlan } from '@/lib/ai/composition/rules';
import { MAX_SECTIONS } from '@/lib/contracts';

const show = (p: NormalisedPlan) => p.sections.map((s) => `${s.type}/${s.variant}`);

describe('normalisePlan', () => {
    it('repairs a section whose variant is not registered, and reports it', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'a' },
            { type: 'about', variant: 'parallax', brief: 'b' },
        ]);
        expect(show(out)).toEqual(['hero/centred', 'about/text']);
        expect(out.repairs).toHaveLength(1);
        expect(out.repairs[0]).toContain('parallax');
    });

    it('drops an unknown section type and reports it', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'a' },
            { type: 'vibes', variant: 'whatever', brief: 'b' },
            { type: 'footer', variant: 'columns', brief: 'c' },
        ]);
        expect(show(out)).toEqual(['hero/centred', 'footer/columns']);
        expect(out.repairs.some((r) => r.includes('vibes'))).toBe(true);
    });

    it('keeps hero first and footer last', () => {
        const out = normalisePlan([
            { type: 'footer', variant: 'columns', brief: 'd' },
            { type: 'about', variant: 'text', brief: 'b' },
            { type: 'hero', variant: 'centred', brief: 'a' },
        ]);
        expect(show(out)).toEqual(['hero/centred', 'about/text', 'footer/columns']);
    });

    it('rewrites a repeated variant on the later section', () => {
        const out = normalisePlan([
            { type: 'services', variant: 'cards', brief: 'a' },
            { type: 'team', variant: 'cards', brief: 'b' },
        ]);
        expect(show(out)).toEqual(['services/cards', 'team/grid']);
    });

    it('catches a footer repeating the last middle section', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'a' },
            { type: 'about', variant: 'text', brief: 'b' },
            { type: 'contact', variant: 'simple', brief: 'c' },
            { type: 'footer', variant: 'simple', brief: 'd' },
        ]);
        expect(show(out)).toEqual([
            'hero/centred', 'about/text', 'contact/simple', 'footer/columns',
        ]);
    });

    it('removes adjacent duplicates before the cap, not after', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'a' },
            { type: 'about', variant: 'text', brief: 'b' },
            { type: 'about', variant: 'text', brief: 'b-dupe' },
            { type: 'services', variant: 'cards', brief: 'c' },
            { type: 'team', variant: 'grid', brief: 'd' },
            { type: 'testimonials', variant: 'quotes', brief: 'e' },
            { type: 'gallery', variant: 'masonry', brief: 'f' },
            { type: 'menu', variant: 'grouped', brief: 'g' },
            { type: 'faq', variant: 'accordion', brief: 'h' },
            { type: 'footer', variant: 'columns', brief: 'i' },
        ]);
        expect(out.sections).toHaveLength(MAX_SECTIONS);
        expect(show(out)).toEqual([
            'hero/centred', 'about/text', 'services/cards', 'team/grid',
            'testimonials/quotes', 'gallery/masonry', 'footer/columns',
        ]);
    });

    it('handles a plan with no hero and no footer', () => {
        const out = normalisePlan([
            { type: 'about', variant: 'text', brief: 'a' },
            { type: 'contact', variant: 'form', brief: 'b' },
        ]);
        expect(show(out)).toEqual(['about/text', 'contact/form']);
    });

    it('inserts contact and drops testimonials when the description asks to register (D11 v22)', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'split-image', brief: 'a' },
            { type: 'about', variant: 'text', brief: 'b' },
            { type: 'services', variant: 'cards', brief: 'c' },
            { type: 'gallery', variant: 'masonry', brief: 'd' },
            { type: 'team', variant: 'cards', brief: 'e' },
            { type: 'testimonials', variant: 'quotes', brief: 'f' },
            { type: 'faq', variant: 'accordion', brief: 'g' },
        ], { prompt: 'two day design conference, venue and a register link' });

        expect(out.sections.some((s) => s.type === 'contact')).toBe(true);
        expect(out.sections.some((s) => s.type === 'testimonials')).toBe(false);
        expect(out.sections.some((s) => s.type === 'gallery')).toBe(false);
        expect(out.repairs.some((r) => /contact/i.test(r))).toBe(true);
    });

    it('drops testimonials for a bare "a website" prompt (D11 v27)', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'minimal', brief: 'a' },
            { type: 'about', variant: 'text', brief: 'b' },
            { type: 'services', variant: 'cards', brief: 'c' },
            { type: 'testimonials', variant: 'quotes', brief: 'd' },
            { type: 'contact', variant: 'simple', brief: 'e' },
            { type: 'footer', variant: 'simple', brief: 'f' },
        ], { prompt: 'a website' });

        expect(out.sections.map((s) => s.type)).not.toContain('testimonials');
        expect(out.sections.map((s) => s.type)).toContain('contact');
    });

    it('drops gallery and testimonials unless the description asked for them', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'a' },
            { type: 'about', variant: 'text', brief: 'b' },
            { type: 'services', variant: 'cards', brief: 'c' },
            { type: 'team', variant: 'grid', brief: 'd' },
            { type: 'testimonials', variant: 'quotes', brief: 'e' },
            { type: 'gallery', variant: 'masonry', brief: 'f' },
            { type: 'footer', variant: 'columns', brief: 'g' },
        ], { prompt: 'calm simple page for my yoga studio' });

        expect(show(out)).toEqual([
            'hero/centred', 'about/text', 'services/cards', 'footer/columns',
        ]);
        expect(out.repairs.some((r) => /gallery\/testimonials\/team/i.test(r))).toBe(true);
    });

    it('keeps gallery when they asked for photos', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'a' },
            { type: 'gallery', variant: 'masonry', brief: 'b' },
            { type: 'contact', variant: 'simple', brief: 'c' },
            { type: 'footer', variant: 'columns', brief: 'd' },
        ], { prompt: 'sweet shop in old delhi, with photos of the mithai trays' });

        expect(out.sections.map((s) => s.type)).toContain('gallery');
        expect(out.sections.map((s) => s.type)).not.toContain('testimonials');
    });

    it('does not treat "post surgery" as a writing ask (D15 v14)', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'split-image', brief: 'a' },
            { type: 'about', variant: 'text', brief: 'b' },
            { type: 'services', variant: 'cards', brief: 'sports, back pain, post-surgery rehab' },
            { type: 'footer', variant: 'simple', brief: 'd' },
        ], { prompt: 'physio clinic in bandra, sports injuries back pain and post surgery rehab' });

        expect(out.sections.find((s) => s.type === 'services')?.brief).not.toMatch(/post title/i);
        expect(out.sections.find((s) => s.type === 'services')?.brief).toMatch(/sports, back pain/i);
    });

    it('drops testimonials on a scoped "just the posts and an about" ask', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'minimal', brief: 'a' },
            { type: 'about', variant: 'text', brief: 'b' },
            { type: 'testimonials', variant: 'quotes', brief: 'c' },
            { type: 'gallery', variant: 'grid', brief: 'd' },
            { type: 'footer', variant: 'simple', brief: 'e' },
        ], { prompt: 'personal blog, keep it minimal, just the posts and an about page' });

        expect(out.sections.map((s) => s.type)).not.toContain('testimonials');
        expect(out.sections.map((s) => s.type)).toContain('about');
        expect(out.sections.map((s) => s.type)).toContain('services');
        const posts = out.sections.find((s) => s.type === 'services');
        expect(posts?.brief).toMatch(/never "Add a post title here"/i);
    });

    it('does not plan a resume-writing shop for a personal site about me (D15 v23)', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'Display name and a CTA to view the resume' },
            { type: 'about', variant: 'text', brief: 'mission to help clients succeed' },
            { type: 'services', variant: 'cards', brief: 'resume packages with pricing' },
            { type: 'gallery', variant: 'grid', brief: 'stock photos of a person' },
            { type: 'testimonials', variant: 'quotes', brief: 'client quotes' },
            { type: 'contact', variant: 'form', brief: 'inquiries' },
            { type: 'footer', variant: 'simple', brief: 'legal' },
        ], { prompt: 'just a simple personal site for myself, what i do where i have worked and how to reach me, nothing flashy' });

        const types = out.sections.map((s) => s.type);
        expect(types).not.toContain('testimonials');
        expect(types).not.toContain('gallery');
        expect(types).toContain('about');
        expect(types).toContain('contact');
        const hero = out.sections.find((s) => s.type === 'hero');
        const about = out.sections.find((s) => s.type === 'about');
        const work = out.sections.find((s) => s.type === 'services');
        expect(hero?.brief).toMatch(/first person/i);
        expect(hero?.brief).toMatch(/never a resume-writing shop/i);
        expect(about?.brief).toMatch(/first person/i);
        expect(about?.brief).toMatch(/Not a mission to help clients/i);
        expect(work?.brief).toMatch(/jobs/i);
        expect(work?.brief).toMatch(/not resume packages/i);
        expect(work?.variant).toBe('timeline');
    });

    it('does not treat a yoga studio with "about me" as a personal resume site', () => {
        expect(isPersonalSite('calm simple page for my yoga studio, class timings, a bit about me and how to reach the place')).toBe(false);
        expect(wantsFirstPersonAbout('calm simple page for my yoga studio, a bit about me')).toBe(true);

        const out = normalisePlan([
            { type: 'hero', variant: 'minimal', brief: 'a' },
            { type: 'about', variant: 'text', brief: 'our studio story' },
            { type: 'services', variant: 'cards', brief: 'classes' },
            { type: 'contact', variant: 'simple', brief: 'find us' },
            { type: 'footer', variant: 'simple', brief: 'd' },
        ], { prompt: 'calm simple page for my yoga studio, class timings, a bit about me and how to reach the place' });

        expect(out.sections.map((s) => s.type)).toContain('services');
        expect(out.sections.find((s) => s.type === 'about')?.brief).toMatch(/first person/i);
        expect(out.sections.find((s) => s.type === 'about')?.brief).toMatch(/not "our studio"/i);
    });

    it('rewrites a bare "a website" so fill cannot plan empty-quote testimonials or Add-heading briefs', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'minimal', brief: 'Show the brand name' },
            { type: 'about', variant: 'text', brief: 'company history' },
            { type: 'services', variant: 'cards', brief: 'products' },
            { type: 'testimonials', variant: 'quotes', brief: 'reviews' },
            { type: 'contact', variant: 'simple', brief: 'phone' },
            { type: 'footer', variant: 'simple', brief: 'legal' },
        ], { prompt: 'a website' });

        const types = out.sections.map((s) => s.type);
        expect(types).not.toContain('testimonials');
        expect(types).not.toContain('services');
        expect(types).toContain('contact');
        expect(out.sections.find((s) => s.type === 'hero')?.brief).toMatch(/never "Add heading here"/i);
        expect(out.sections.find((s) => s.type === 'about')?.brief).toMatch(/do not invent a company/i);
    });

    it('asks team for roles, not Attorney Name, when the prompt names nobody', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'a' },
            { type: 'team', variant: 'grid', brief: 'photos, names, years of practice for each attorney' },
            { type: 'footer', variant: 'columns', brief: 'c' },
        ], { prompt: 'site for a small law firm doing property and family matters — meet the lawyers' });

        expect(out.sections.find((s) => s.type === 'team')?.brief).toMatch(/never "Attorney Name"/i);
        expect(out.sections.find((s) => s.type === 'team')?.brief).not.toMatch(/photos, names/i);
    });

    it('keeps Donate on the hero brief when the prompt asks for donations', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'split-image', brief: 'invite parents to enroll kids' },
            { type: 'about', variant: 'text', brief: 'mission' },
            { type: 'footer', variant: 'simple', brief: 'd' },
        ], { prompt: 'page for our NGO that runs after school classes for kids, we need donations and volunteers to sign up' });

        expect(out.sections.find((s) => s.type === 'hero')?.brief).toMatch(/Donate or Volunteer/i);
        expect(out.sections.find((s) => s.type === 'hero')?.brief).toMatch(/not Enroll/i);
    });

    it('tells contact not to invent a phone the description did not give', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'a' },
            { type: 'contact', variant: 'form', brief: 'phone 1-800-555-0123 and sales@example.com' },
            { type: 'footer', variant: 'simple', brief: 'c' },
        ], { prompt: 'landing page for a tool that helps small shops track stock' });

        expect(out.sections.find((s) => s.type === 'contact')?.brief)
            .toMatch(/empty unless the description gives them/i);
    });

    it('pins a native-script name on the hero brief (D15 v29)', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'split-image', brief: 'Display the Hindi name' },
            { type: 'about', variant: 'text', brief: 'the shop' },
            { type: 'footer', variant: 'simple', brief: 'end' },
        ], {
            prompt: 'मिठास स्वीट्स — our sweet shop in old delhi, want the name in hindi at the top',
        });

        expect(out.sections.find((s) => s.type === 'hero')?.brief).toContain('मिठास स्वीट्स');
        expect(out.sections.find((s) => s.type === 'hero')?.brief).toMatch(/never a transliteration/i);
    });

    it('rewrites services into a pricing table when the prompt asks for one (D15 v21)', () => {
        const prompt = 'landing page for a tool that helps small shops track stock, clean and professional, pricing table';
        expect(wantsPricing(prompt)).toBe(true);

        const out = normalisePlan([
            { type: 'hero', variant: 'split-image', brief: 'tagline' },
            { type: 'about', variant: 'text', brief: 'mission' },
            { type: 'services', variant: 'cards', brief: 'key features: alerts and barcode scanning' },
            { type: 'testimonials', variant: 'quotes', brief: 'quotes' },
            { type: 'faq', variant: 'accordion', brief: 'pricing plans and security' },
            { type: 'contact', variant: 'form', brief: 'sales inquiries' },
            { type: 'footer', variant: 'columns', brief: 'legal' },
        ], { prompt });

        const price = out.sections.find((s) => s.type === 'services' || s.type === 'menu');
        expect(price).toBeTruthy();
        expect(price?.brief).toMatch(/pricing table on this page/i);
        expect(price?.brief).toMatch(/never "see our pricing page"/i);
        expect(out.sections.find((s) => s.type === 'faq')?.brief).toMatch(/never "see our pricing page"/i);
    });

    it('inserts a price-capable section when the plan skipped it', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'a' },
            { type: 'about', variant: 'text', brief: 'b' },
            { type: 'testimonials', variant: 'quotes', brief: 'c' },
            { type: 'footer', variant: 'simple', brief: 'd' },
        ], { prompt: 'bold loud page for a boutique gym, class packages and pricing' });

        const price = out.sections.find((s) => s.type === 'services' || s.type === 'menu');
        expect(price).toBeTruthy();
        expect(price?.brief).toMatch(/pricing table on this page/i);
        expect(out.repairs.some((r) => /pricing/i.test(r))).toBe(true);
    });

    it('does not treat "post surgery" as a pricing ask', () => {
        expect(wantsPricing('physio clinic in bandra, sports injuries back pain and post surgery rehab')).toBe(false);
    });

    it('inserts pages the person named when the plan skipped them', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'a' },
            { type: 'about', variant: 'text', brief: 'b' },
            { type: 'contact', variant: 'simple', brief: 'c' },
            { type: 'footer', variant: 'simple', brief: 'd' },
        ], {
            prompt: 'south indian restaurant — I need a menu page, an FAQ page, and a gallery of the dining room',
        });

        expect(out.sections.map((s) => s.type)).toEqual(
            expect.arrayContaining(['menu', 'faq', 'gallery']),
        );
        expect(out.repairs.some((r) => /asked for that page/i.test(r))).toBe(true);
    });

    it('forces menu + Order now brief when they ask for cart and waiter tickets', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'welcome' },
            { type: 'about', variant: 'text', brief: 'story' },
            { type: 'footer', variant: 'simple', brief: 'end' },
        ], {
            prompt: 'restaurant site with add to cart, table number, and send to waiter tickets',
        });

        expect(out.sections.map((s) => s.type)).toContain('menu');
        expect(out.sections.find((s) => s.type === 'hero')?.brief).toMatch(/Order now/i);
        expect(out.sections.find((s) => s.type === 'menu')?.brief).toMatch(/waiter/i);
    });

    it('stays generic when they only ask for a restaurant website', () => {
        const out = normalisePlan([
            { type: 'hero', variant: 'centred', brief: 'a' },
            { type: 'about', variant: 'text', brief: 'b' },
            { type: 'menu', variant: 'grouped', brief: 'c' },
            { type: 'gallery', variant: 'grid', brief: 'd' },
            { type: 'testimonials', variant: 'quotes', brief: 'e' },
            { type: 'contact', variant: 'simple', brief: 'f' },
            { type: 'footer', variant: 'simple', brief: 'g' },
        ], { prompt: 'website for my south indian restaurant with a menu' });

        expect(out.sections.map((s) => s.type)).toContain('menu');
        expect(out.sections.map((s) => s.type)).not.toContain('gallery');
        expect(out.sections.map((s) => s.type)).not.toContain('testimonials');
        expect(out.sections.find((s) => s.type === 'hero')?.brief).not.toMatch(/Order now/i);
    });
});
