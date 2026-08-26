import { describe, it, expect } from 'vitest';
import { compare, markdownTable } from '../../../evals/compare';
import type { AutoGrade, HumanGrade } from '../../../evals/grader/index';

const row = (id: string, passed: boolean, over: Partial<AutoGrade> = {}): AutoGrade => ({
    id,
    vertical: id,
    hasTemplate: false,
    group: 'no-template',
    completed: passed,
    nonBlank: passed,
    requiredSectionsPresent: passed,
    forbiddenSectionsAbsent: true,
    categoryCorrect: true,
    sectionCount: passed ? 6 : 0,
    variantsDistinct: true,
    fallbackUsed: false,
    passed,
    blankFields: [],
    placeholderFields: [],
    missingSections: [],
    forbiddenSections: [],
    requests: 9,
    tokens: 9000,
    latencyMs: 100,
    ...over,
});

const human = (id: string, copy: HumanGrade['copySensible']): HumanGrade => ({
    id, copySensible: copy, sectionSelectionAppropriate: null,
    artDirectionAppropriate: null, notes: '',
});

describe('compare — an average hides a regression', () => {
    it('names a vertical that broke even though the rate rose', () => {
        const before = [row('a', false), row('b', false), row('c', true)];
        const after = [row('a', true), row('b', true), row('c', false)];

        const report = compare(before, after);

        expect(report.beforeRate).toBeCloseTo(1 / 3);
        expect(report.afterRate).toBeCloseTo(2 / 3);
        expect(report.improved).toBe(2);
        expect(report.regressed).toBe(1);

        // The rate rose. It is still not acceptable.
        expect(report.acceptable).toBe(false);
        expect(report.rows.find((r) => r.id === 'c')?.delta).toBe('REGRESSED');
    });

    it('accepts a pass rate that rose with nothing broken', () => {
        const report = compare(
            [row('a', false), row('b', true)],
            [row('a', true), row('b', true)],
        );
        expect(report.acceptable).toBe(true);
        expect(report.regressed).toBe(0);
    });

    it('refuses a tuning pass that changed nothing', () => {
        const report = compare([row('a', true)], [row('a', true)]);
        expect(report.afterRate).toBe(report.beforeRate);
        expect(report.acceptable).toBe(false);
    });

    it('sorts regressions to the top of the table', () => {
        const report = compare(
            [row('a', false), row('z', true)],
            [row('a', true), row('z', false)],
        );
        expect(report.rows[0].id).toBe('z');
        expect(report.rows[0].delta).toBe('REGRESSED');
    });
});

describe('compare — nothing quietly drops out', () => {
    it('reports a vertical that appears in only one run and blocks on it', () => {
        const report = compare(
            [row('a', true), row('b', false)],
            [row('a', true)],
        );
        expect(report.unmatched).toEqual(['b']);
        expect(report.acceptable).toBe(false);
    });

    it('does not invent a comparison for an unmatched vertical', () => {
        const report = compare([row('a', true)], [row('b', true)]);
        expect(report.rows).toEqual([]);
        expect(report.unmatched.sort()).toEqual(['a', 'b']);
    });
});

describe('compare — a regression names itself', () => {
    it('says which objective check flipped', () => {
        const before = [row('a', true)];
        const after = [row('a', false, {
            completed: true, nonBlank: false, blankFields: ['s_01.heading'],
        })];

        expect(compare(before, after).rows[0].reason).toContain('non-blank lost');
    });

    it('calls out a run that only finished by falling back', () => {
        const before = [row('a', true)];
        const after = [row('a', false, { completed: true, fallbackUsed: true })];

        expect(compare(before, after).rows[0].reason).toContain('no fallback lost');
    });

    it('reports a moved failure stage when nothing else changed', () => {
        const before = [row('a', false, { failureStage: 'plan' })];
        const after = [row('a', false, { failureStage: 'fill' })];

        expect(compare(before, after).rows[0].reason).toContain('now at fill');
    });
});

describe('compare — the published table', () => {
    it('marks a regression so it cannot be skimmed past', () => {
        const md = markdownTable(compare(
            [row('a', false), row('b', true)],
            [row('a', true), row('b', false)],
        ));

        expect(md).toContain('**REGRESSED**');
        expect(md).toContain('NOT acceptable');
        expect(md).toContain('1 vertical(s) regressed');
    });

    it('carries the human copy score beside the objective one', () => {
        const md = markdownTable(compare(
            [row('a', true)], [row('a', true)],
            [human('a', 2)], [human('a', 4)],
        ));
        expect(md).toContain('pass · 2/5');
        expect(md).toContain('pass · 4/5');
    });

    it('leaves the copy column empty when nobody read it', () => {
        const md = markdownTable(compare([row('a', true)], [row('a', true)]));
        expect(md).not.toContain('/5');
    });
});
