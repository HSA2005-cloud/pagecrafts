import { contractFor } from '@/lib/ai/sections/contracts';
import type { Composition, SectionKey } from '@/lib/contracts';

/**
 * The stage a generation died at. Required on every failure — "generation is
 * flaky" is not actionable, "eleven of thirty failed at fill" is.
 */
export type FailureStage = 'classify' | 'profile' | 'plan' | 'fill' | 'assemble';

export interface CorpusExpectation {
    /** Acceptable categories, preferred first. The enum ships synonyms
     *  (health / healthcare / health_wellness / wellness), so a single
     *  expected value would score correct answers as wrong. */
    category: string[];
    mustHave: SectionKey[];
    shouldNotHave: SectionKey[];
}

export interface CorpusItem {
    id: string;
    vertical: string;
    group: 'no-template' | 'template' | 'adversarial' | 'non-english';
    domain: string;
    hasTemplate: boolean;
    prompt: string;
    expect: CorpusExpectation;
}

/** What one pipeline run produced. Discriminated so a failure cannot omit its stage. */
export type GenerationOutcome =
    | {
        completed: true;
        composition: Composition;
        category: string;
        /** Set when the run only finished by falling back to a hand-authored template. */
        fallbackTemplateId?: string;
        requests: number;
        tokens: number;
        latencyMs: number;
    }
    | {
        completed: false;
        failureStage: FailureStage;
        error: string;
        /** A template fallback still leaves the user with a site, but not a passing one. */
        fallbackTemplateId?: string;
        requests: number;
        tokens: number;
        latencyMs: number;
    };

export interface AutoGrade {
    id: string;
    vertical: string;
    hasTemplate: boolean;
    group: CorpusItem['group'];

    completed: boolean;
    nonBlank: boolean;
    requiredSectionsPresent: boolean;
    forbiddenSectionsAbsent: boolean;
    categoryCorrect: boolean;
    sectionCount: number;
    variantsDistinct: boolean;
    fallbackUsed: boolean;
    failureStage?: FailureStage;

    /**
     * AC-F4-1: valid, non-blank, without fallback — plus the section
     * expectations, which are the objective half of "appropriate for the
     * vertical". Deliberately NOT the same as `completed`: a vertical that
     * fell back to a template completed and failed the quality bar.
     *
     * `categoryCorrect` and `variantsDistinct` are diagnostics and do not gate
     * `passed` — a right-looking page under a defensible neighbouring category
     * is not a product failure.
     */
    passed: boolean;

    /** Field paths that came back empty, e.g. `s_02.items[0].body`. */
    blankFields: string[];
    /** Field paths still carrying a placeholder, e.g. "Founded in [year]". */
    placeholderFields: string[];
    missingSections: SectionKey[];
    forbiddenSections: SectionKey[];

    requests: number;
    tokens: number;
    latencyMs: number;
}

export interface HumanGrade {
    id: string;
    copySensible: 1 | 2 | 3 | 4 | 5 | null;
    sectionSelectionAppropriate: 1 | 2 | 3 | 4 | 5 | null;
    artDirectionAppropriate: 1 | 2 | 3 | 4 | 5 | null;
    notes: string;
}

// ── emptiness ──────────────────────────────────────────────────────────────

/** Empty means: no content a visitor would see. `{query:'',alt:''}` is empty. */
function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0 || value.every(isEmpty);
    if (typeof value === 'object') {
        const entries = Object.values(value as Record<string, unknown>);
        return entries.length === 0 || entries.every(isEmpty);
    }
    return false;
}

/**
 * Every field the contract asks the model to fill, checked individually.
 * `assemble.isBlank` only catches a wholly empty page; a hero with an empty
 * heading is the failure that actually happens.
 */
export function blankFieldsIn(composition: Composition): string[] {
    const blanks: string[] = [];

    for (const section of composition.sections) {
        const contract = contractFor(section.type);
        const props = section.props as Record<string, unknown>;

        for (const field of contract.fields) {
            if (field.type === 'color') continue;
            const value = props[field.key];

            if (field.optional) continue;

            if (isEmpty(value)) {
                blanks.push(`${section.id}.${field.key}`);
                continue;
            }

            if (field.type === 'list' && Array.isArray(value)) {
                value.forEach((item, i) => {
                    for (const sub of field.itemSchema ?? []) {
                        const cell = (item as Record<string, unknown>)?.[sub.key];
                        if (isEmpty(cell)) {
                            blanks.push(`${section.id}.${field.key}[${i}].${sub.key}`);
                        }
                    }
                });
            }
        }
    }

    return blanks;
}

/**
 * Copy the model left for someone else to finish.
 *
 * Found by reading the first real run: a hospital's About section shipped
 * "Founded in [year], our 40-bed hospital…" and the grader passed it, because
 * the field was not empty and emptiness was all it checked. A bracketed slug is
 * not content — it is a note to a human that never got actioned, and it is the
 * most obviously broken thing a visitor can see.
 *
 * Deliberately narrow. `[year]` and `{{name}}` are placeholders; "[sic]" and
 * ordinary bracketed asides are not, so the pattern requires a short
 * lowercase-or-underscore token and nothing else inside the brackets.
 */
const BRACKETED = /\[([a-z][a-z _-]{1,24})\]/gi;
const OTHER_PLACEHOLDER = /\{\{[^}]{1,40}\}\}|\b(?:TODO|FIXME|LOREM IPSUM|XXXX+)\b/i;

/**
 * Bracketed marks that are real editorial notation rather than an unfilled
 * slot. Short and closed on purpose — the list of things a writer legitimately
 * puts in square brackets mid-sentence is genuinely this small, and everything
 * else in brackets in generated marketing copy is a slot nobody filled.
 */
const EDITORIAL = /^(sic|ed|emphasis added|translated|clarification|verbatim)$/i;

function hasPlaceholder(text: string): boolean {
    if (OTHER_PLACEHOLDER.test(text)) return true;

    BRACKETED.lastIndex = 0;
    for (const match of text.matchAll(BRACKETED)) {
        if (!EDITORIAL.test(match[1].trim())) return true;
    }
    return false;
}

export function placeholderFieldsIn(composition: Composition): string[] {
    const found: string[] = [];

    const walk = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
            if (hasPlaceholder(value)) found.push(path);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((v, i) => walk(v, `${path}[${i}]`));
            return;
        }
        if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                walk(v, `${path}.${k}`);
            }
        }
    };

    for (const section of composition.sections) walk(section.props, section.id);
    return found;
}

/** Distinct `type:variant` pairs. One variant repeated down the page reads as machine-assembled. */
export function variantSignature(composition: Composition): string {
    return composition.sections.map((s) => `${s.type}:${s.variant}`).join('|');
}

function variantsAreDistinct(composition: Composition): boolean {
    const variants = composition.sections
        .filter((s) => s.type !== 'hero' && s.type !== 'footer')
        .map((s) => s.variant);
    if (variants.length < 2) return true;
    return new Set(variants).size > 1;
}

// ── the grade ──────────────────────────────────────────────────────────────

export function grade(item: CorpusItem, outcome: GenerationOutcome): AutoGrade {
    const base = {
        id: item.id,
        vertical: item.vertical,
        hasTemplate: item.hasTemplate,
        group: item.group,
        requests: outcome.requests,
        tokens: outcome.tokens,
        latencyMs: outcome.latencyMs,
    };

    if (!outcome.completed) {
        return {
            ...base,
            completed: false,
            nonBlank: false,
            requiredSectionsPresent: false,
            forbiddenSectionsAbsent: false,
            categoryCorrect: false,
            sectionCount: 0,
            variantsDistinct: false,
            fallbackUsed: outcome.fallbackTemplateId !== undefined,
            failureStage: outcome.failureStage,
            passed: false,
            blankFields: [],
            placeholderFields: [],
            missingSections: [...item.expect.mustHave],
            forbiddenSections: [],
        };
    }

    const { composition } = outcome;
    const present = new Set(composition.sections.map((s) => s.type));

    const missingSections = item.expect.mustHave.filter((k) => !present.has(k));
    const forbiddenSections = item.expect.shouldNotHave.filter((k) => present.has(k));
    const blankFields = blankFieldsIn(composition);
    const placeholderFields = placeholderFieldsIn(composition);

    // A field holding "[year]" is not blank and is not content either.
    const nonBlank = blankFields.length === 0 && placeholderFields.length === 0;
    const requiredSectionsPresent = missingSections.length === 0;
    const forbiddenSectionsAbsent = forbiddenSections.length === 0;
    const fallbackUsed = outcome.fallbackTemplateId !== undefined;

    return {
        ...base,
        completed: true,
        nonBlank,
        requiredSectionsPresent,
        forbiddenSectionsAbsent,
        categoryCorrect: item.expect.category.includes(outcome.category),
        sectionCount: composition.sections.length,
        variantsDistinct: variantsAreDistinct(composition),
        fallbackUsed,
        passed: nonBlank && requiredSectionsPresent && forbiddenSectionsAbsent && !fallbackUsed,
        blankFields,
        placeholderFields,
        missingSections,
        forbiddenSections,
    };
}

// ── summaries ──────────────────────────────────────────────────────────────

export interface PassRate {
    passed: number;
    total: number;
    rate: number;
}

const rateOf = (rows: AutoGrade[]): PassRate => ({
    passed: rows.filter((r) => r.passed).length,
    total: rows.length,
    rate: rows.length ? rows.filter((r) => r.passed).length / rows.length : 0,
});

export interface CorpusSummary {
    overall: PassRate;
    /** The claim under test, split from the control group. */
    noTemplate: PassRate;
    withTemplate: PassRate;
    byGroup: Record<string, PassRate>;
    completedButFailed: number;
    fallbackUsed: number;
    categoryCorrect: number;
    totalRequests: number;
    totalTokens: number;
}

export function summarise(rows: AutoGrade[]): CorpusSummary {
    const byGroup: Record<string, PassRate> = {};
    for (const group of new Set(rows.map((r) => r.group))) {
        byGroup[group] = rateOf(rows.filter((r) => r.group === group));
    }

    return {
        overall: rateOf(rows),
        noTemplate: rateOf(rows.filter((r) => !r.hasTemplate)),
        withTemplate: rateOf(rows.filter((r) => r.hasTemplate)),
        byGroup,
        completedButFailed: rows.filter((r) => r.completed && !r.passed).length,
        fallbackUsed: rows.filter((r) => r.fallbackUsed).length,
        categoryCorrect: rows.filter((r) => r.categoryCorrect).length,
        totalRequests: rows.reduce((s, r) => s + r.requests, 0),
        totalTokens: rows.reduce((s, r) => s + r.tokens, 0),
    };
}

/** A blank sheet — every judgement `null`, so an unread row can never read as a 3. */
export function blankHumanSheet(items: CorpusItem[]): HumanGrade[] {
    return items.map((i) => ({
        id: i.id,
        copySensible: null,
        sectionSelectionAppropriate: null,
        artDirectionAppropriate: null,
        notes: '',
    }));
}

export interface HumanSummary {
    copySensible: number | null;
    sectionSelectionAppropriate: number | null;
    artDirectionAppropriate: number | null;
    /** Rows still unread, per column. A mean over a partly-read sheet is not a score. */
    unread: Record<string, number>;
    complete: boolean;
}

const COLUMNS = ['copySensible', 'sectionSelectionAppropriate', 'artDirectionAppropriate'] as const;

/**
 * Means only once a column is fully read. A partial column reports `null` and
 * its unread count rather than an average that quietly excludes the rows
 * nobody looked at.
 */
export function summariseHuman(sheet: HumanGrade[]): HumanSummary {
    const unread: Record<string, number> = {};
    const means: Record<string, number | null> = {};

    for (const column of COLUMNS) {
        const values = sheet.map((r) => r[column]);
        const read = values.filter((v): v is 1 | 2 | 3 | 4 | 5 => v !== null);
        unread[column] = values.length - read.length;
        means[column] = unread[column] === 0 && read.length > 0
            ? read.reduce((s, v) => s + v, 0) / read.length
            : null;
    }

    return {
        copySensible: means.copySensible,
        sectionSelectionAppropriate: means.sectionSelectionAppropriate,
        artDirectionAppropriate: means.artDirectionAppropriate,
        unread,
        complete: COLUMNS.every((c) => unread[c] === 0),
    };
}
