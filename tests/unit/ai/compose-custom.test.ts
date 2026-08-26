import { describe, expect, it, beforeEach } from 'vitest';

import { setGateway } from '@/lib/ai/gateway';
import { MockGateway } from '@/lib/ai/gateway/mock';
import { resetAiConfig } from '@/lib/ai/config';
import { composeCustomSite } from '@/lib/ai/generate/compose-custom';
import { buildCustomStyleOptions } from '@/lib/ai/generate/options';

describe('composeCustomSite', () => {
    beforeEach(() => {
        resetAiConfig();
        setGateway(new MockGateway('ok') as never);
    });

    it('returns a multi-file site from the model', async () => {
        const result = await composeCustomSite(
            'Build a waiter orders page with a cart',
            {
                category: 'food',
                vertical: 'restaurant',
                tone: 'warm',
                palette: 'light',
                sections: ['hero', 'menu', 'contact', 'footer'],
                fallback: false,
            },
        );

        expect(result.data.files['index.html']).toMatch(/<html/i);
        expect(result.data.files['styles.css']).toBeTruthy();
        expect(result.data.composition.meta.title).toBeTruthy();

        const looks = await buildCustomStyleOptions(result.data.composition, result.data.files);
        expect(looks).toHaveLength(3);
        expect(looks[0].files['styles.css']).toMatch(/pagecrafts look: casual/);
        expect(looks[1].files['styles.css']).toMatch(/pagecrafts look: photos/);
        expect(looks[1].files['styles.css']).toMatch(/100svh/);
        expect(looks[1].files['index.html']).toMatch(/data-style="photos"/);
    });
});
