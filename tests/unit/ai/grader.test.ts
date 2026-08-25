import { describe, it, expect } from 'vitest';
import {
    grade, summarise, blankFieldsIn, placeholderFieldsIn, blankHumanSheet, summariseHuman,
    type CorpusItem, type GenerationOutcome,
} from '../../../evals/grader/index';
import {
    measureDiversity, rowFor, THEME_SHARE_MAX, MOTION_SHARE_MAX,
} from '../../../evals/grader/diversity';
import { clusterFailures, topThree, failuresByStage } from '../../../evals/grader/taxonomy';
import { failureStageOf, toOutcome } from '../../../evals/grader/adapt';
import type { SpikeResult } from '../../../evals/spike/pipeline';
import { SCHEMA_VERSION, type ArtDirection, type Composition, type SectionInstance } from '@/lib/contracts';

// ── fixtures ───────────────────────────────────────────────────────────────

const ART: ArtDirection = {
    themeId: 'clinical-blue',
    motionId: 'whisper',
    radiusId: 'soft',
    spacingId: 'default',
    imageryId: 'bright-clean',
};

const section = (
    id: string,
    type: SectionInstance['type'],
    variant: string,
    props: Record<string, unknown>,
): SectionInstance => ({
    id, type, variant, brief: 'b', visible: true, locked: false, source: 'ai', props,
});

const HERO_PROPS = {
    eyebrow: 'Koramangala',
    heading: 'Family dentistry',
    sub: 'Check-ups, root canals and braces.',
    ctaLabel: 'Book',
    image: { query: 'dental clinic', alt: 'Clinic' },
};

const CONTACT_PROPS = {
    heading: 'Find us',
    blurb: 'Open six days.',
    address: '4th Block',
    phone: '080 1234',
    email: 'hi@x.in',
    hours: '9-6',
};

const SERVICES_PROPS = {
    heading: 'What we do',
    items: [{ title: 'Braces', body: 'Alignment over 18 months.' }],
};

function composition(sections: SectionInstance[], art: ArtDirection = ART): Composition {
    return {
        schemaVersion: SCHEMA_VERSION,
        vertical: 'dental-clinic',
        artDirection: art,
        meta: { title: 'T', description: 'D', lang: 'en' },
        sections,
    };
}

const GOOD = composition([
    section('s_01', 'hero', 'split-image', HERO_PROPS),
    section('s_02', 'services', 'cards', SERVICES_PROPS),
    section('s_03', 'contact', 'simple', CONTACT_PROPS),
]);

const ITEM: CorpusItem = {
    id: 'v03',
    vertical: 'dental-clinic',
    group: 'no-template',
    domain: 'health',
    hasTemplate: false,
    prompt: 'dental clinic',
    expect: {
        category: ['healthcare', 'other'],
        mustHave: ['hero', 'services', 'contact'],
        shouldNotHave: ['menu'],
    },
};

const ok = (comp: Composition, category = 'healthcare'): GenerationOutcome => ({
    completed: true, composition: comp, category, requests: 9, tokens: 9000, latencyMs: 100,
});

// ── the three grading rules the day turns on ───────────────────────────────

describe('grader — completed is not passed', () => {
    it('passes a clean generation', () => {
        const g = grade(ITEM, ok(GOOD));
        expect(g.completed).toBe(true);
        expect(g.passed).toBe(true);
    });

    it('fails a run that only finished by falling back to a template', () => {
        const g = grade(ITEM, { ...ok(GOOD), fallbackTemplateId: 'dentist-1' });
        // It completed. It did not pass. AC-F4-1 asks for non-blank *without* fallback.
        expect(g.completed).toBe(true);
        expect(g.fallbackUsed).toBe(true);
        expect(g.passed).toBe(false);
    });

    it('fails a completed run that is missing a required section', () => {
        const g = grade(ITEM, ok(composition([
            section('s_01', 'hero', 'split-image', HERO_PROPS),
            section('s_02', 'about', 'text', { heading: 'A', body: 'B', image: { query: 'q', alt: 'a' } }),
        ])));
        expect(g.completed).toBe(true);
        expect(g.passed).toBe(false);
        expect(g.missingSections).toEqual(['services', 'contact']);
    });

    it('fails a completed run carrying a section the vertical should not have', () => {
        const g = grade(ITEM, ok(composition([
            ...GOOD.sections,
            section('s_04', 'menu', 'simple', {
                heading: 'Menu',
                items: [{ name: 'X', description: 'Y', price: '10' }],
            }),
        ])));
        expect(g.forbiddenSections).toEqual(['menu']);
        expect(g.passed).toBe(false);
    });

    it('keeps a defensible neighbouring category out of the pass decision', () => {
        const g = grade(ITEM, ok(GOOD, 'business'));
        expect(g.categoryCorrect).toBe(false);
        // Diagnostic, not a product failure — the page is still right.
        expect(g.passed).toBe(true);
    });
});

describe('grader — failureStage on every failure', () => {
    it('carries the stage through from a failed run', () => {
        const g = grade(ITEM, {
            completed: false, failureStage: 'fill', error: 'boom',
            requests: 4, tokens: 400, latencyMs: 10,
        });
        expect(g.passed).toBe(false);
        expect(g.failureStage).toBe('fill');
    });

    const spike = (over: Partial<SpikeResult>): SpikeResult => ({
        vertical: 'x', prompt: 'p', hasTemplate: false, mode: 'full',
        ok: false, calls: [], requests: 0, modelTimeMs: 0, wallClockMs: 0, ...over,
    });

    it('derives classify when nothing was even classified', () => {
        expect(failureStageOf(spike({ error: 'unreachable' }))).toBe('classify');
    });

    it('derives profile once classify returned', () => {
        expect(failureStageOf(spike({
            error: 'profile(x): failed validation',
            calls: [{ stage: 'classify', model: 'm', inputTokens: 1, outputTokens: 1, latencyMs: 1 }],
        }))).toBe('profile');
    });

    it('derives plan once the profile exists', () => {
        expect(failureStageOf(spike({
            error: 'plan: model output failed validation',
            calls: [{ stage: 'classify', model: 'm', inputTokens: 1, outputTokens: 1, latencyMs: 1 }],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            partial: { profile: {} as any },
        }))).toBe('plan');
    });

    it('names assemble by its own error, not by what it produced', () => {
        expect(failureStageOf(spike({
            error: 'assemble: no content for section s_02 (services).',
            calls: [{ stage: 'classify', model: 'm', inputTokens: 1, outputTokens: 1, latencyMs: 1 }],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            partial: { profile: {} as any, sections: [] as any },
        }))).toBe('assemble');
    });

    it('adapts a failed spike into an outcome that must name its stage', () => {
        const outcome = toOutcome(spike({ error: 'nope' }));
        expect(outcome.completed).toBe(false);
        if (!outcome.completed) expect(outcome.failureStage).toBe('classify');
    });
});

describe('grader — blank fields', () => {
    it('accepts a fully filled page', () => {
        expect(blankFieldsIn(GOOD)).toEqual([]);
    });

    it('catches an empty top-level field', () => {
        const bad = composition([section('s_01', 'hero', 'centred', { ...HERO_PROPS, heading: '  ' })]);
        expect(blankFieldsIn(bad)).toContain('s_01.heading');
    });

    it('catches an empty cell inside a list item', () => {
        const bad = composition([section('s_02', 'services', 'cards', {
            heading: 'What we do',
            items: [{ title: 'Braces', body: '' }],
        })]);
        expect(blankFieldsIn(bad)).toContain('s_02.items[0].body');
    });

    /**
     * From the first real run. The hospital's About body shipped
     * "Founded in [year], our 40-bed hospital…" and the grader passed the page,
     * because the field was not empty and emptiness was all it checked.
     */
    it('catches copy the model left for someone else to finish', () => {
        const unfinished = composition([section('s_02', 'about', 'text', {
            heading: 'Our history',
            body: 'Founded in [year], our 40-bed hospital has served the city.',
            image: { query: 'hospital', alt: 'Hospital' },
        })]);

        expect(placeholderFieldsIn(unfinished)).toContain('s_02.body');

        const g = grade({ ...ITEM, expect: { ...ITEM.expect, mustHave: ['about'] } },
            ok(unfinished));
        expect(g.nonBlank).toBe(false);
        expect(g.passed).toBe(false);
    });

    it('catches a placeholder inside a list item, and a stray template token', () => {
        const bad = composition([section('s_03', 'services', 'cards', {
            heading: 'What we do',
            items: [
                { title: 'Cardiology', body: 'Care since [year_founded].' },
                { title: 'Ortho', body: 'Led by {{doctor_name}}.' },
            ],
        })]);

        const found = placeholderFieldsIn(bad);
        expect(found).toContain('s_03.items[0].body');
        expect(found).toContain('s_03.items[1].body');
    });

    it('does not fire on ordinary prose that happens to use brackets', () => {
        const fine = composition([section('s_04', 'about', 'text', {
            heading: 'About',
            // A real aside, a citation marker, and an acronym gloss.
            body: 'We opened in 2004 [sic] and now run three clinics (MD, DM).',
            image: { query: 'clinic', alt: 'Clinic' },
        })]);

        expect(placeholderFieldsIn(fine)).toEqual([]);
    });

    it('treats an image with empty query and alt as blank', () => {
        const bad = composition([section('s_01', 'hero', 'centred', {
            ...HERO_PROPS, image: { query: '', alt: '' },
        })]);
        expect(blankFieldsIn(bad)).toContain('s_01.image');
    });

    it('does not treat an empty contact phone as a blank page', () => {
        const page = composition([
            section('s_01', 'hero', 'split-image', HERO_PROPS),
            section('s_02', 'services', 'cards', SERVICES_PROPS),
            section('s_03', 'contact', 'simple', {
                heading: 'Find us',
                blurb: 'We will add a number.',
                address: '',
                phone: '',
                email: '',
                hours: '',
            }),
        ]);
        expect(blankFieldsIn(page)).toEqual([]);
        expect(grade(ITEM, ok(page)).passed).toBe(true);
    });
});

// ── diversity ──────────────────────────────────────────────────────────────

describe('diversity — R-NEW-C', () => {
    const withArt = (themeId: string, motionId: string, variant = 'cards') =>
        composition(
            [section('s_01', 'hero', 'centred', HERO_PROPS), section('s_02', 'services', variant, SERVICES_PROPS)],
            { ...ART, themeId: themeId as ArtDirection['themeId'], motionId: motionId as ArtDirection['motionId'] },
        );

    it('flags a corpus where every page got the same theme', () => {
        const rows = Array.from({ length: 10 }, (_, i) =>
            rowFor(`v${i}`, withArt('clinical-blue', 'whisper')));
        const d = measureDiversity(rows);

        expect(d.dominantThemeShare).toBe(1);
        expect(d.passes).toBe(false);
        expect(d.variantSets).toBe(1);
        expect(d.notes.join(' ')).toContain('HEADLINE');
    });

    it('passes a spread corpus', () => {
        const themes = ['clinical-blue', 'warm-editorial', 'deep-luxury', 'vivid-energy',
            'calm-sage', 'mono-precision', 'sunlit-craft', 'tech-slate'];
        const motions = ['none', 'whisper', 'calm', 'editorial', 'kinetic'];
        const rows = Array.from({ length: 20 }, (_, i) =>
            rowFor(`v${i}`, withArt(themes[i % 8], motions[i % 5], `var-${i % 4}`)));

        const d = measureDiversity(rows);
        expect(d.dominantThemeShare).toBeLessThanOrEqual(THEME_SHARE_MAX);
        expect(d.dominantMotionShare).toBeLessThanOrEqual(MOTION_SHARE_MAX);
        expect(d.passes).toBe(true);
    });

    it('does not call an empty corpus a pass', () => {
        const d = measureDiversity([]);
        expect(d.passes).toBe(false);
        expect(d.notes.join(' ')).toContain('unproven');
    });
});

// ── taxonomy ───────────────────────────────────────────────────────────────

describe('taxonomy — ranking is the point', () => {
    const failed = (vertical: string, stage: 'fill' | 'plan', error: string) => {
        const outcome: GenerationOutcome = {
            completed: false, failureStage: stage, error, requests: 3, tokens: 300, latencyMs: 5,
        };
        return { grade: grade({ ...ITEM, vertical }, outcome), outcome };
    };

    it('clusters by stage and symptom and ranks by count × impact', () => {
        const runs = [
            failed('a', 'fill', 'fillSection(hero): model output failed validation'),
            failed('b', 'fill', 'fillSection(faq): model output failed validation'),
            failed('c', 'fill', 'fillSection(team): model output failed validation'),
            failed('d', 'plan', 'provider unreachable'),
        ];

        const clusters = clusterFailures(runs);
        expect(clusters[0].symptom).toBe('schema-rejection');
        expect(clusters[0].stage).toBe('fill');
        expect(clusters[0].count).toBe(3);
        expect(clusters[0].verticals).toEqual(['a', 'b', 'c']);
        // The real bad output, not a description of it.
        expect(clusters[0].exampleOutput).toContain('failed validation');
    });

    it('separates a timeout from a schema rejection', () => {
        const clusters = clusterFailures([failed('a', 'fill', 'request timed out after 45000ms')]);
        expect(clusters[0].symptom).toBe('timeout');
    });

    it('caps D12 at three clusters', () => {
        const runs = [
            failed('a', 'fill', 'timed out'),
            failed('b', 'plan', 'failed validation'),
            failed('c', 'fill', 'unreachable'),
            failed('d', 'plan', 'ECONNRESET socket hang up'),
        ];
        expect(topThree(clusterFailures(runs)).length).toBe(3);
    });

    it('tallies where generations die', () => {
        const tally = failuresByStage([
            failed('a', 'fill', 'x'), failed('b', 'fill', 'y'), failed('c', 'plan', 'z'),
        ]);
        expect(tally[0]).toEqual({ stage: 'fill', failures: 2 });
    });

    it('folds in generic-copy only where a person actually read it', () => {
        const outcome = ok(GOOD);
        const g = grade(ITEM, outcome);

        const unread = clusterFailures([{ grade: g, outcome, human: {
            id: 'v03', copySensible: null, sectionSelectionAppropriate: null,
            artDirectionAppropriate: null, notes: '',
        } }]);
        expect(unread.some((c) => c.symptom === 'generic-copy')).toBe(false);

        const read = clusterFailures([{ grade: g, outcome, human: {
            id: 'v03', copySensible: 2, sectionSelectionAppropriate: 4,
            artDirectionAppropriate: 4, notes: 'reads like a brochure',
        } }]);
        expect(read.some((c) => c.symptom === 'generic-copy')).toBe(true);
    });
});

// ── human sheet ────────────────────────────────────────────────────────────

describe('human grades — a default is not a score', () => {
    it('starts every judgement null', () => {
        const sheet = blankHumanSheet([ITEM]);
        expect(sheet[0].copySensible).toBeNull();
        expect(sheet[0].sectionSelectionAppropriate).toBeNull();
        expect(sheet[0].artDirectionAppropriate).toBeNull();
    });

    it('refuses to average a partly-read column', () => {
        const s = summariseHuman([
            { id: 'a', copySensible: 5, sectionSelectionAppropriate: 5, artDirectionAppropriate: 5, notes: '' },
            { id: 'b', copySensible: null, sectionSelectionAppropriate: 5, artDirectionAppropriate: 5, notes: '' },
        ]);
        expect(s.copySensible).toBeNull();
        expect(s.unread.copySensible).toBe(1);
        expect(s.complete).toBe(false);
        // The fully-read columns still report.
        expect(s.sectionSelectionAppropriate).toBe(5);
    });

    it('reports means once a column is fully read', () => {
        const s = summariseHuman([
            { id: 'a', copySensible: 4, sectionSelectionAppropriate: 4, artDirectionAppropriate: 4, notes: '' },
            { id: 'b', copySensible: 2, sectionSelectionAppropriate: 2, artDirectionAppropriate: 2, notes: '' },
        ]);
        expect(s.copySensible).toBe(3);
        expect(s.complete).toBe(true);
    });
});

// ── the split that makes the number defensible ─────────────────────────────

describe('summary — split by template, not one number', () => {
    it('reports the no-template group separately from the control group', () => {
        const rows = [
            grade({ ...ITEM, id: 'a', hasTemplate: false }, ok(GOOD)),
            grade({ ...ITEM, id: 'b', hasTemplate: false }, {
                completed: false, failureStage: 'plan', error: 'x',
                requests: 1, tokens: 1, latencyMs: 1,
            }),
            grade({ ...ITEM, id: 'c', hasTemplate: true, group: 'template' }, ok(GOOD)),
        ];

        const s = summarise(rows);
        expect(s.noTemplate).toEqual({ passed: 1, total: 2, rate: 0.5 });
        expect(s.withTemplate).toEqual({ passed: 1, total: 1, rate: 1 });
        expect(s.byGroup['no-template'].total).toBe(2);
        expect(s.overall.total).toBe(3);
    });
});
