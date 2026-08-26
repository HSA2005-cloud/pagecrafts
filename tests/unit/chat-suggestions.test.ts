import { describe, expect, it } from 'vitest';
import { chatSuggestions } from '@/lib/editor/chat-suggestions';
import type { Composition } from '@/lib/contracts';

function sample(types: Array<Composition['sections'][number]['type']>): Composition {
    return {
        schemaVersion: 3,
        vertical: 'consultant',
        artDirection: {
            themeId: 'clinical-blue',
            motionId: 'calm',
            radiusId: 'soft',
            spacingId: 'default',
            imageryId: 'bright-clean',
        },
        meta: { title: 'Test', description: 'Test', lang: 'en' },
        sections: types.map((type, index) => ({
            id: `s${index}`,
            type,
            variant: 'centred',
            brief: '',
            visible: true,
            locked: false,
            source: 'ai',
            props: { heading: type },
        })),
    };
}

describe('chat suggestions', () => {
    it('offers copy changes when a forked design is already on the page', () => {
        const items = chatSuggestions({ composition: null, hasPage: true });
        expect(items.map((item) => item.label)).toContain('Rewrite the headline');
        expect(items.map((item) => item.label)).not.toContain('Create a sweet shop website');
    });

    it('offers starters when the page is still empty', () => {
        const items = chatSuggestions({ composition: null });
        expect(items.map((item) => item.label)).toContain('Create a sweet shop website');
        expect(items.some((item) => item.compose)).toBe(true);
    });

    it('offers follow-ups from what is on the page', () => {
        const items = chatSuggestions({
            composition: sample(['hero', 'services', 'contact']),
            lastUserText: 'Make it warmer',
        });
        expect(items.map((item) => item.label)).toEqual(
            expect.arrayContaining([
                'Sharpen the headline',
                'Make the copy warmer',
                'Keep going with my last instruction',
            ]),
        );
        expect(items.find((item) => item.id === 'keep-going')?.send).toBe('Make it warmer');
    });

    // Ask rewrites the words in one section — edit.v1: "you change the content of ONE
    // section", "never write HTML". It cannot return a layout, so "use a slide-through
    // layout" answered "that change did not go through" every time it was tapped.
    it('never suggests a change Ask cannot make', () => {
        const items = chatSuggestions({
            composition: sample(['hero', 'services', 'contact']),
            lastUserText: 'Make it warmer',
        });
        const labels = items.map((item) => item.label);

        expect(labels).not.toContain('Use a slide-through layout');
        expect(labels).not.toContain('Make the hero more graphical');
        for (const label of labels) {
            expect(label, label).not.toMatch(/layout|graphical|animation|3d/i);
        }
    });

    it('sends a full instruction, not the three words on the chip', () => {
        const items = chatSuggestions({
            composition: sample(['hero', 'services', 'contact']),
        });

        for (const item of items) {
            // keep-going echoes what the person typed, so its length is theirs, not ours.
            if (item.compose || item.id === 'keep-going') continue;

            const sent = item.send ?? item.label;
            expect(sent.split(' ').length, item.id).toBeGreaterThan(3);
        }
    });
});
