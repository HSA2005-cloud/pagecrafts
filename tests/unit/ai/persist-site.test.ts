import { describe, expect, it } from 'vitest';

import { projectNameFromPrompt } from '@/lib/ai/generate/name';
import { contentFromComposition, schemaFromComposition, sectionContentKey } from '@/lib/ai/generate/schema';
import { persistGeneratedSite, persistStyleOption } from '@/lib/ai/generate/persist';
import { compositionToFiles } from '@/lib/ai/generate/to-files';
import { SCHEMA_VERSION, type ArtDirection, type Composition, type SectionInstance, type Template } from '@/lib/contracts';
import type { Job } from '@/lib/ai/jobs/types';
import { createFakeDb } from '../../support/fake-db';

const ART: ArtDirection = {
    themeId: 'calm-sage', motionId: 'whisper', radiusId: 'soft',
    spacingId: 'airy', imageryId: 'warm-natural',
};

const section = (
    id: string,
    type: SectionInstance['type'],
    variant: string,
    props: Record<string, unknown>,
    visible = true,
): SectionInstance => ({
    id, type, variant, brief: 'b', visible, locked: false, source: 'ai', props,
});

const composition: Composition = {
    schemaVersion: SCHEMA_VERSION,
    vertical: 'dental-clinic',
    artDirection: ART,
    meta: { title: 'Smile Dental', description: 'Family dentistry in Koramangala', lang: 'en' },
    sections: [
        section('s_01', 'hero', 'split-image', {
            eyebrow: 'Koramangala',
            heading: 'Family dentistry',
            sub: 'Check-ups and braces.',
            ctaLabel: 'Book',
            image: { query: 'dental clinic', alt: 'Clinic waiting room' },
        }),
        section('s_02', 'services', 'cards', {
            heading: 'What we do',
            items: [{ title: 'Braces', body: 'Alignment over 18 months.' }],
        }),
        section('s_03', 'contact', 'simple', {
            heading: 'Find us',
            blurb: 'Open six days.',
            address: '4th Block',
            phone: '080 1234',
            email: 'hi@x.in',
            hours: '9-6',
        }),
        section('s_04', 'footer', 'simple', { tagline: 'Smile Dental · Koramangala' }),
    ],
};

const fallbackTemplate = {
    id: 'gym',
    name: 'Pulse Gym',
    description: 'A gym site',
    category: 'fitness',
    vertical: 'gym',
    tags: ['gym'],
    thumbnailUrl: '',
    files: { 'index.html': '<h1>Pulse Gym</h1>' },
    contentSchema: { sections: [{ key: 'hero', label: 'Hero', fields: [] }] },
    license: 'MIT',
    sourceUrl: 'https://example.com',
    tier: 'free',
    priceInr: 0,
} satisfies Template;

function jobOf(projectId: string, patch: Partial<Job> = {}): Job {
    return {
        id: 'job_1',
        projectId,
        userId: 'u1',
        prompt: 'a family dental clinic',
        status: 'done',
        sectionsDone: 4,
        sectionsTotal: 4,
        startedAt: Date.now(),
        events: [],
        ledger: [],
        ...patch,
    };
}

describe('projectNameFromPrompt', () => {
    it('capitalises a short description', () => {
        expect(projectNameFromPrompt('a bakery in pune')).toBe('A bakery in pune');
    });

    it('fits the project name column', () => {
        const name = projectNameFromPrompt('x'.repeat(200));
        expect(name.length).toBeLessThanOrEqual(80);
        expect(name.endsWith('…')).toBe(true);
    });
});

describe('schemaFromComposition', () => {
    it('uses section types as panel keys when they are unique', () => {
        const schema = schemaFromComposition(composition);
        expect(schema.sections.map((s) => s.key)).toEqual(['hero', 'services', 'contact', 'footer']);
        expect(schema.sections[0]?.fields.some((f) => f.key === 'heading')).toBe(true);
    });

    it('disambiguates a repeated type', () => {
        expect(sectionContentKey(
            { id: 's_09', type: 'gallery' },
            [{ type: 'gallery' }, { type: 'gallery' }],
        )).toBe('gallery-s_09');
    });

    it('copies list items into content_json and skips image queries', () => {
        const content = contentFromComposition(composition);
        expect(content.hero).toMatchObject({ heading: 'Family dentistry', ctaLabel: 'Book' });
        expect(content.hero).not.toHaveProperty('image');
        expect(content.services).toMatchObject({
            items: [{ title: 'Braces', body: 'Alignment over 18 months.' }],
        });
    });
});

describe('persistGeneratedSite', () => {
    it('writes the generated files, schema and first commit', async () => {
        const db = createFakeDb({ users: [{ id: 'u1' }] });
        const project = db.insert('projects', { user_id: 'u1', name: 'Draft' });
        const id = project.id as string;

        await persistGeneratedSite(db.asUser('u1'), id, jobOf(id, {
            composition,
            files: compositionToFiles(composition),
        }));

        const files = db.rows('project_files').filter((f) => f.project_id === id);
        expect(files.map((f) => f.path).sort()).toEqual([
            'about.html',
            'composition.json',
            'contact.html',
            'index.html',
            'services.html',
            'settings.html',
        ]);
        expect(String(files.find((f) => f.path === 'index.html')?.content)).toContain('Family dentistry');

        const row = db.rows('projects').find((p) => p.id === id)!;
        expect(row.name).toBe('Smile Dental');
        expect(row.content_json).toMatchObject({ hero: { heading: 'Family dentistry' } });
        expect((row.content_schema as { sections: { key: string }[] }).sections.map((s) => s.key))
            .toEqual(['hero', 'services', 'contact', 'footer']);

        const commits = db.rows('commits').filter((c) => c.project_id === id);
        expect(commits).toHaveLength(1);
        expect(commits[0]?.message).toBe('Generated from your description');
        expect(commits[0]?.author).toBe('system');
    });

    it('copies the nearest template when generation fell back', async () => {
        const db = createFakeDb({ users: [{ id: 'u1' }] });
        const project = db.insert('projects', { user_id: 'u1', name: '1947 Restaurant' });
        const id = project.id as string;

        await persistGeneratedSite(
            db.asUser('u1'),
            id,
            jobOf(id, { fallbackTemplateId: 'gym' }),
            [fallbackTemplate],
        );

        const files = db.rows('project_files').filter((f) => f.project_id === id);
        expect(files).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: 'index.html', content: '<h1>Pulse Gym</h1>' }),
        ]));
    });

    it('does not rename the project after a design the person never chose', async () => {
        const db = createFakeDb({ users: [{ id: 'u1' }] });
        const project = db.insert('projects', { user_id: 'u1', name: '1947 Restaurant' });
        const id = project.id as string;

        await persistGeneratedSite(
            db.asUser('u1'),
            id,
            jobOf(id, { fallbackTemplateId: 'gym' }),
            [fallbackTemplate],
        );

        const row = db.rows('projects').find((p) => p.id === id)!;

        expect(row.name).toBe('1947 Restaurant');
        expect(row.name).not.toBe('Pulse Gym');
        expect((row.site_meta as { title?: string }).title).toBe('1947 Restaurant');
    });

    it('records in history that it could not generate, rather than claiming a start', async () => {
        const db = createFakeDb({ users: [{ id: 'u1' }] });
        const project = db.insert('projects', { user_id: 'u1', name: '1947 Restaurant' });
        const id = project.id as string;

        await persistGeneratedSite(
            db.asUser('u1'),
            id,
            jobOf(id, { fallbackTemplateId: 'gym' }),
            [fallbackTemplate],
        );

        const message = String(db.rows('commits')[0]?.message);

        expect(message).toMatch(/could not generate/i);
        expect(message).toContain('Pulse Gym');
    });

    it('still renames the project when the site really was generated', async () => {
        const db = createFakeDb({ users: [{ id: 'u1' }] });
        const project = db.insert('projects', { user_id: 'u1', name: 'Draft' });
        const id = project.id as string;

        await persistGeneratedSite(db.asUser('u1'), id, jobOf(id, {
            composition,
            files: compositionToFiles(composition),
        }));

        expect(db.rows('projects').find((p) => p.id === id)!.name).toBe('Smile Dental');
    });

    it('is a no-op when the client cannot write', async () => {
        await expect(persistGeneratedSite({} as never, 'p1', jobOf('p1'))).resolves.toBeUndefined();
    });

    it('writes the look the person picked', async () => {
        const db = createFakeDb({ users: [{ id: 'u1' }] });
        const project = db.insert('projects', { user_id: 'u1', name: 'Draft' });
        const id = project.id as string;
        const { buildStyleOptions } = await import('@/lib/ai/generate/options');
        const [casual] = await buildStyleOptions(composition);

        await persistStyleOption(db.asUser('u1'), id, casual!);

        const files = db.rows('project_files').filter((f) => f.project_id === id);
        expect(String(files.find((f) => f.path === 'index.html')?.content)).toContain('data-style="casual"');
        expect(db.rows('commits')[0]?.message).toBe('Generated — Casual look');
    });
});
