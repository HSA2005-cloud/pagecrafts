import type { StyleOption } from '../generate/options';
import type { StyleId, StyleTier } from '../generate/styles';
import type { Job } from './types';

export interface PublicVariant {
    id: StyleId;
    label: string;
    blurb: string;
    tier: StyleTier;
    price_inr: number;
    html: string;
}

export interface GenerationAttempt {
    job_id: string;
    index: number;
    variants: PublicVariant[];
}

const LINK_TO_STYLES = /<link\b[^>]*href\s*=\s*["']?\.?\/?styles\.css["']?[^>]*>/gi;

/**
 * One self-contained page for the picker to render.
 *
 * Only index.html was sent, and a custom build keeps its CSS in a separate styles.css that
 * index.html links to by relative path. A preview card has no server to resolve that
 * against, so all three looks arrived as raw HTML -- Times New Roman, blue underlined
 * links -- and identical to each other, because the stylesheet was the only thing that
 * differed between them.
 *
 * The recipe path never showed this: compositionToFiles writes its CSS into a <style> tag
 * in the same file. This does the same thing for the custom path, for the preview only. The
 * files that get saved to the project are untouched.
 */
function inlineStyles(files: StyleOption['files']): string {
    const html = files['index.html'] ?? '';
    const css = files['styles.css'];

    if (!html || !css) return html;

    const style = `<style>\n${css}\n</style>`;
    const withoutLink = html.replace(LINK_TO_STYLES, '');

    if (/<\/head>/i.test(withoutLink)) {
        return withoutLink.replace(/<\/head>/i, `${style}</head>`);
    }

    // A fragment with no head of its own; the picker renders it as-is, so the style has to
    // ride in front of the markup rather than nowhere at all.
    return `${style}\n${withoutLink}`;
}

export function publicVariant(option: StyleOption): PublicVariant {
    return {
        id: option.id,
        label: option.label,
        blurb: option.blurb,
        tier: option.tier,
        price_inr: option.priceInr,
        html: inlineStyles(option.files),
    };
}

/** Finished look-sets for a project, oldest first — so earlier tries stay pickable. */
export function attemptsFromJobs(jobs: readonly Job[]): GenerationAttempt[] {
    return jobs
        .filter((job) => job.status === 'done' && (job.variants?.length ?? 0) > 0)
        .map((job, index) => ({
            job_id: job.id,
            index: index + 1,
            variants: (job.variants ?? []).map(publicVariant),
        }));
}
