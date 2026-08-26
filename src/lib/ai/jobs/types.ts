import type { Composition, FileMap } from '@/lib/contracts';
import type { LedgerRow } from '../cost/ledger';
import type { StyleOption } from '../generate/options';

export type JobStatus =
    | 'queued' | 'planning' | 'streaming' | 'validating'
    | 'repairing' | 'done' | 'failed';

/** Ordered so a caller can tell forward progress from a repeat. */
export const JOB_STATES: readonly JobStatus[] = [
    'queued', 'planning', 'streaming', 'validating', 'repairing', 'done', 'failed',
] as const;

export type JobEventName =
    | 'plan' | 'section' | 'validate' | 'repair' | 'done' | 'fallback';

export interface JobEvent {
    name: JobEventName;
    at: number;
    data?: Record<string, unknown>;
}

export interface Job {
    id: string;
    projectId: string;
    userId: string;
    /** What the person typed. Never overwritten — it is shown back to them. */
    prompt: string;
    /**
     * The expanded brief the build actually ran on, when Gemini widened the short one.
     *
     * Kept beside `prompt` rather than replacing it: the expansion is an instruction the
     * system wrote to itself, injection-guard tags and all, and it was being shown to the
     * person as their own description.
     */
    buildPrompt?: string;
    status: JobStatus;
    sectionsDone: number;
    sectionsTotal: number;
    provider?: string;
    startedAt: number;
    endedAt?: number;
    events: JobEvent[];
    ledger: LedgerRow[];
    composition?: Composition;
    /** Generated file tree, present when generation produced a site rather than a fallback. */
    files?: FileMap;
    /** Three looks (casual / photo-rich / animated) for the person to pick from. */
    variants?: StyleOption[];
    /** Set when generation was abandoned and a template was substituted. */
    fallbackTemplateId?: string;
    error?: string;
}

export interface JobStore {
    create(job: Job): Promise<Job>;
    get(id: string): Promise<Job | undefined>;
    update(id: string, patch: Partial<Job>): Promise<Job | undefined>;
    listByProject(projectId: string): Promise<Job[]>;
}
