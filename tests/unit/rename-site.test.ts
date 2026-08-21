import { describe, expect, it } from 'vitest';
import {
    parseRenameIntent,
    renameComposition,
    renameExplanation,
    replaceName,
} from '@/lib/editor/rename-site';
import type { Composition } from '@/lib/contracts';

function site(title = 'Ravi Clothing'): Composition {
    return {
        schemaVersion: 3,
        vertical: 'clothing',
        artDirection: {
            themeId: 'sunlit-craft',
            motionId: 'calm',
            radiusId: 'soft',
            spacingId: 'default',
            imageryId: 'warm-natural',
        },
        meta: {
            title,
            description: 'Ravi Clothing – nice clothes for shoppers in Bangalore.',
            lang: 'en',
        },
        sections: [
            {
                id: 'hero',
                type: 'hero',
                variant: 'split-image',
                brief: 'Hero for Ravi Clothing',
                visible: true,
                locked: false,
                source: 'ai',
                props: {
                    heading: 'Ravi Clothing',
                    sub: 'Featured collection',
                    image: {
                        url: 'https://images.unsplash.com/photo-x?q=ravi',
                        alt: 'Ravi Clothing shop',
                    },
                },
            },
            {
                id: 'footer',
                type: 'footer',
                variant: 'simple',
                brief: '',
                visible: true,
                locked: false,
                source: 'ai',
                props: {
                    tagline: 'Ravi Clothing – nice clothes for shoppers in Bangalore.',
                },
            },
        ],
    };
}

describe('parseRenameIntent', () => {
    it('reads change X to Y', () => {
        expect(parseRenameIntent('change ravi clothing to Pragna clothing', 'Ravi Clothing')).toEqual({
            from: 'ravi clothing',
            to: 'Pragna clothing',
        });
    });

    it('reads rename to Y using the current title', () => {
        expect(parseRenameIntent('rename to Pragna Clothing', 'Ravi Clothing')).toEqual({
            from: 'Ravi Clothing',
            to: 'Pragna Clothing',
        });
    });

    it('ignores ordinary section edits', () => {
        expect(parseRenameIntent('make the heading shorter', 'Ravi Clothing')).toBeNull();
    });
});

describe('renameComposition', () => {
    it('updates the title, footer, and heading, and leaves image URLs alone', () => {
        const { next, hits } = renameComposition(site(), 'Ravi Clothing', 'Pragna Clothing');
        expect(hits).toBeGreaterThan(2);
        expect(next.meta.title).toBe('Pragna Clothing');
        expect(next.meta.description).toContain('Pragna Clothing');
        expect(next.sections[0].props.heading).toBe('Pragna Clothing');
        expect(next.sections[1].props.tagline).toContain('Pragna Clothing');
        expect((next.sections[0].props.image as { url: string }).url).toContain('unsplash.com');
        expect((next.sections[0].props.image as { alt: string }).alt).toBe('Pragna Clothing shop');
    });

    it('is case-insensitive for the old name', () => {
        expect(replaceName('RAVI clothing near you', 'ravi clothing', 'Pragna Clothing')).toBe(
            'Pragna Clothing near you',
        );
    });

    it('explains how many places changed', () => {
        expect(renameExplanation('Ravi Clothing', 'Pragna Clothing', 4)).toMatch(/4 places/);
        expect(renameExplanation('Ravi Clothing', 'Pragna Clothing', 0)).toMatch(/Could not find/);
    });
});
