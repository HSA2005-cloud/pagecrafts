import {
    loadGenerationJob,
    startProjectGenerate,
    type GenerationJobStatus,
} from '@/lib/project-source';
import type { Composition } from '@/lib/contracts';
import { writingLabel } from '@/lib/editor/generation-steps';

const POLL_MS = 1500;
const MAX_POLLS = 40;

export function generationProgressCopy(job: GenerationJobStatus): string {
    switch (job.status) {
        case 'queued':
            return 'Preparing your site…';
        case 'planning':
            return 'Planning the pages…';
        case 'streaming': {
            const current = job.planned_sections?.[job.sections_done];
            if (current) return writingLabel(current);
            if (job.sections_total > 0) {
                return `Writing the site… ${job.sections_done} of ${job.sections_total}`;
            }
            return 'Writing the site…';
        }
        case 'validating':
            return 'Checking the page…';
        case 'repairing':
            return 'Fixing a section…';
        case 'done':
            return 'A site is ready to review.';
        case 'failed':
            return 'The site could not be generated.';
        default:
            return 'Preparing your site…';
    }
}

export function generationExplanation(composition: Composition, replacing: boolean): string {
    const title = composition.meta.title.trim() || 'your site';
    const names = composition.sections
        .filter((section) => section.visible)
        .map((section) => section.type)
        .slice(0, 6)
        .join(', ');
    const body = names ? ` It includes ${names}.` : '';
    if (replacing) {
        return `A new page for ${title} is ready.${body} Keep it to replace the current site, or discard to leave things as they are.`;
    }
    return `A page for ${title} is ready.${body} Keep it to add the files, or discard to leave the project as it is.`;
}

export async function generateSiteProposal(
    projectId: string,
    prompt: string,
    onProgress: (message: string, job: GenerationJobStatus) => void,
): Promise<{ composition: Composition | null; error: string | null }> {
    const { jobId, error } = await startProjectGenerate(projectId, prompt);
    if (error || !jobId) {
        return { composition: null, error: error ?? 'The site could not be generated.' };
    }

    for (let i = 0; i < MAX_POLLS; i++) {
        const { job, error: pollError } = await loadGenerationJob(jobId);
        if (pollError || !job) {
            return { composition: null, error: pollError ?? 'The site could not be generated.' };
        }

        onProgress(generationProgressCopy(job), job);

        if (job.status === 'failed') {
            return {
                composition: null,
                error: 'The site could not be generated. Try a more specific description.',
            };
        }

        if (job.status === 'done') {
            return compositionFromJob(job);
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }

    return { composition: null, error: 'That is taking too long. Try again.' };
}

/** A finished job is a generated composition, never a ranked gallery template. */
export function compositionFromJob(job: GenerationJobStatus): {
    composition: Composition | null;
    error: string | null;
} {
    if (job.fallback_template_id || !job.composition) {
        return {
            composition: null,
            error: 'The site could not be generated from your description. Try again with more detail.',
        };
    }
    return { composition: job.composition, error: null };
}
