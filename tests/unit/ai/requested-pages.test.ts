import { describe, expect, it } from 'vitest';

import {
    asksTableOrdering,
    requestedSections,
} from '@/lib/ai/composition/requested-pages';
import { wireTableOrderSite } from '@/lib/sites/table-order-ui';

describe('requested pages', () => {
    it('finds named pages in a detailed brief', () => {
        expect(requestedSections(
            'I want a menu page, FAQ, and a gallery of photos',
        )).toEqual(expect.arrayContaining(['menu', 'faq', 'gallery']));
    });

    it('does not invent asks from a vague brief', () => {
        expect(requestedSections('website for my cafe')).toEqual([]);
        expect(asksTableOrdering('website for my cafe with a menu')).toBe(false);
    });

    it('detects cart + table + waiter only when asked', () => {
        expect(asksTableOrdering(
            'cart with table number and send to the waiter',
        )).toBe(true);
        expect(requestedSections(
            'restaurant with add to cart and waiter tickets',
        )).toContain('menu');
    });
});

describe('wireTableOrderSite', () => {
    it('adds cart dock, waiter page, and rewrites Order now', () => {
        const files = wireTableOrderSite({
            'index.html': `<!DOCTYPE html><html><head></head><body>
<a href="#contact">Order now</a>
<section id="menu" data-type="menu">
<article class="menu-item"><h3>Idli</h3><p>Rs 40</p></article>
</section>
</body></html>`,
        }, { businessName: 'Udupi House' });

        expect(files['waiter.html']).toMatch(/Waiter tickets/);
        expect(files['index.html']).toMatch(/id="order-cart"/);
        expect(files['index.html']).toMatch(/href="#order-cart"/);
        expect(files['index.html']).toMatch(/data-add-dish="Idli"/);
    });
});
