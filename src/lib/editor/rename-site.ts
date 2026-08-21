import type { Composition, SectionProps } from '@/lib/contracts';

export interface RenameIntent {
    from: string;
    to: string;
}

/**
 * Spot a rename like "change Ravi Clothing to Pragna Clothing".
 * When the old name is omitted ("rename to Pragna Clothing"), use the
 * site title already on the composition.
 */
export function parseRenameIntent(instruction: string, currentTitle: string): RenameIntent | null {
    const text = instruction.replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const paired =
        text.match(
            /^(?:please\s+)?(?:change|rename|replace|update)\s+(.+?)\s+(?:to|into|with)\s+(.+?)\s*$/i,
        ) ??
        text.match(
            /^(?:please\s+)?(?:change|rename|replace|update)\s+(?:the\s+)?(?:name|title|business(?:\s+name)?|brand|shop|store)\s+(?:from\s+)?(.+?)\s+(?:to|into|with)\s+(.+?)\s*$/i,
        );

    if (paired) {
        const from = cleanName(paired[1]);
        const to = cleanName(paired[2]);
        if (from && to && !sameName(from, to)) return { from, to };
    }

    const toOnly = text.match(
        /^(?:please\s+)?(?:rename|name|call)\s+(?:it|this|the\s+site|the\s+business|the\s+shop|the\s+store)?\s*(?:to|as)?\s+(.+?)\s*$/i,
    );
    if (toOnly) {
        const to = cleanName(toOnly[1]);
        const from = cleanName(currentTitle);
        if (from && to && !sameName(from, to)) return { from, to };
    }

    return null;
}

function cleanName(value: string): string {
    return value
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
        .replace(/\b(the\s+name|name|title|business name|brand)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function sameName(a: string, b: string): boolean {
    return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive replace; keeps the replacement spelling the person typed. */
export function replaceName(text: string, from: string, to: string): string {
    if (!from) return text;
    return text.replace(new RegExp(escapeRegExp(from), 'gi'), to);
}

function rewriteValue(value: unknown, from: string, to: string): unknown {
    if (typeof value === 'string') {
        // Do not touch absolute URLs — a short name can appear in a query string.
        if (/^https?:\/\//i.test(value.trim())) return value;
        return replaceName(value, from, to);
    }
    if (Array.isArray(value)) {
        return value.map((item) => rewriteValue(item, from, to));
    }
    if (value && typeof value === 'object') {
        const next: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            next[key] = rewriteValue(child, from, to);
        }
        return next;
    }
    return value;
}

/**
 * Swap the business name across the whole composition: title, description,
 * and every text prop. Layout and image URLs stay put.
 */
export function renameComposition(
    composition: Composition,
    from: string,
    to: string,
): { next: Composition; hits: number } {
    const before = JSON.stringify(composition);
    const next: Composition = {
        ...composition,
        meta: {
            ...composition.meta,
            title: replaceName(composition.meta.title, from, to),
            description: replaceName(composition.meta.description, from, to),
        },
        sections: composition.sections.map((section) => ({
            ...section,
            brief: replaceName(section.brief, from, to),
            props: rewriteValue(section.props, from, to) as SectionProps,
        })),
    };
    const after = JSON.stringify(next);
    if (before === after) return { next: composition, hits: 0 };

    const pattern = new RegExp(escapeRegExp(from), 'gi');
    const hits = (before.match(pattern) ?? []).length;
    return { next, hits };
}

export function renameExplanation(from: string, to: string, hits: number): string {
    if (hits <= 0) {
        return `Could not find “${from}” on this site to rename.`;
    }
    return `Renames “${from}” to “${to}” across the site (${hits} place${hits === 1 ? '' : 's'}).`;
}
