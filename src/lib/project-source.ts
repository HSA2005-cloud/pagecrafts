import { apiGet, apiPatch, apiPost, apiPostHeaders, apiPut, apiUpload } from '@/lib/api/client';
import type {
    AssetResponse,
    Commit,
    Composition,
    ContentOp,
    DeploymentResponse,
    EditProposal,
    FileMap,
    ImageSearchResponse,
    ListCommitsResponse,
    PublishProjectResponse,
    RestoreResponse,
    GetProjectFilesResponse,
    PatchContentResponse,
    PatchProjectRequest,
    ProjectDetail,
    SectionKey,
} from '@/lib/contracts';
import type { CreateCommitResponse } from '@/lib/contracts';

export interface CommitResult {
    sha: string | null;
    error: string | null;
}

export async function createCommit(projectId: string, message: string): Promise<CommitResult> {
    const { data, error } = await apiPost<CreateCommitResponse>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/commits`,
        { message },
    );

    if (error || !data) return { sha: null, error: error ?? 'The server replied with nothing at all.' };
    return { sha: data.sha, error: null };
}

export interface ProjectLoadResult {
    files: FileMap;
    updatedAt: string | null;
    error: string | null;
}

export interface ProjectSaveResult {
    updatedAt: string | null;
    error: string | null;
}

const EMPTY_REPLY = 'The server replied with nothing at all.';

function filesUrl(projectId: string): string {
    return `/api/v1/projects/${encodeURIComponent(projectId)}/files`;
}

export async function loadProjectFiles(projectId: string): Promise<ProjectLoadResult> {
    if (!projectId.trim()) {
        return { files: {}, updatedAt: null, error: 'No project was requested.' };
    }

    const { data, error } = await apiGet<GetProjectFilesResponse>(filesUrl(projectId));

    if (error || !data) {
        return { files: {}, updatedAt: null, error: error ?? EMPTY_REPLY };
    }

    return { files: data.files, updatedAt: data.updatedAt, error: null };
}

export async function saveProjectFiles(
    projectId: string,
    files: FileMap,
): Promise<ProjectSaveResult> {
    if (Object.keys(files).length === 0) {
        return { updatedAt: null, error: 'A project must have at least one file.' };
    }

    const { data, error } = await apiPut<GetProjectFilesResponse>(filesUrl(projectId), { files });

    if (error || !data) {
        return { updatedAt: null, error: error ?? EMPTY_REPLY };
    }

    return { updatedAt: data.updatedAt, error: null };
}

export interface CommitListResult {
    items: Commit[];
    error: string | null;
}

/** The project's save points, newest first — read from the mirror, so it is one query. */
export async function loadCommits(projectId: string): Promise<CommitListResult> {
    const { data, error } = await apiGet<ListCommitsResponse>(
        `${projectUrl(projectId)}/commits`,
    );

    if (error || !data) return { items: [], error: error ?? EMPTY_REPLY };
    return { items: data.items, error: null };
}

/**
 * Put the working tree back to a chosen version. Additive: this writes a new commit on top
 * rather than erasing what came after, so changing your mind again is always possible.
 */
export async function restoreVersion(
    projectId: string,
    sha: string,
): Promise<{ newSha: string | null; error: string | null }> {
    const { data, error } = await apiPost<RestoreResponse>(`${projectUrl(projectId)}/restore`, {
        sha,
    });

    if (error || !data) return { newSha: null, error: error ?? EMPTY_REPLY };
    return { newSha: data.newSha, error: null };
}

export interface ProjectDetailResult {
    detail: ProjectDetail | null;
    error: string | null;
}

function projectUrl(projectId: string): string {
    return `/api/v1/projects/${encodeURIComponent(projectId)}`;
}

/**
 * The project row behind the editor: its name, its stored content, its site settings, and
 * the content schema the panel is drawn from. One fetch, alongside the file tree.
 */
export async function loadProjectDetail(projectId: string): Promise<ProjectDetailResult> {
    const { data, error } = await apiGet<ProjectDetail>(projectUrl(projectId));

    if (error || !data) return { detail: null, error: error ?? EMPTY_REPLY };
    return { detail: data, error: null };
}

/**
 * Structured content through to `content_json`. The markup the person is looking at has
 * already been updated locally — this is the canonical copy catching up, so a failure here
 * is worth saying out loud but must never roll back what they typed.
 */
export async function saveProjectContent(
    projectId: string,
    ops: ContentOp[],
): Promise<{ error: string | null }> {
    if (ops.length === 0) return { error: null };

    const { data, error } = await apiPatch<PatchContentResponse>(
        `${projectUrl(projectId)}/content`,
        { ops },
    );

    if (error || !data) return { error: error ?? EMPTY_REPLY };
    return { error: null };
}

/** Site settings — name, meta tags, form endpoint (S-2, S-3, S-4). */
export async function saveProjectSettings(
    projectId: string,
    patch: PatchProjectRequest,
): Promise<ProjectDetailResult> {
    const { data, error } = await apiPatch<ProjectDetail>(projectUrl(projectId), patch);

    if (error || !data) return { detail: null, error: error ?? EMPTY_REPLY };
    return { detail: data, error: null };
}

/* --------------------------------------------------------- the image library */

export interface ImageSearchOutcome {
    results: ImageSearchResponse | null;
    error: string | null;
}

export async function searchImages(query: string, page = 1): Promise<ImageSearchOutcome> {
    const search = new URLSearchParams({ q: query, page: String(page) });
    const { data, error } = await apiGet<ImageSearchResponse>(`/api/v1/images/search?${search}`);

    if (error || !data) return { results: null, error: error ?? EMPTY_REPLY };
    return { results: data, error: null };
}

export interface AssetOutcome {
    asset: AssetResponse | null;
    error: string | null;
}

/**
 * A chosen photo into the project (S-1). The server downloads it, registers the download
 * with Unsplash and records the photographer — the browser never holds the access key and
 * never has to be trusted to credit anyone.
 */
export async function pickUnsplashImage(
    projectId: string,
    unsplashId: string,
    kind: 'image' | 'favicon' | 'og_image' = 'image',
): Promise<AssetOutcome> {
    const { data, error } = await apiPost<AssetResponse>(`${projectUrl(projectId)}/assets`, {
        source: 'unsplash',
        unsplashId,
        kind,
    });

    if (error || !data) return { asset: null, error: error ?? EMPTY_REPLY };
    return { asset: data, error: null };
}

export async function uploadProjectImage(
    projectId: string,
    file: File,
    kind: 'image' | 'favicon' | 'og_image' = 'image',
): Promise<AssetOutcome> {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);

    const { data, error } = await apiUpload<AssetResponse>(`${projectUrl(projectId)}/assets`, form);

    if (error || !data) return { asset: null, error: error ?? EMPTY_REPLY };
    return { asset: data, error: null };
}

export function pickEntryFile(paths: string[]): string | null {
    if (paths.length === 0) return null;
    if (paths.includes('index.html')) return 'index.html';
    return [...paths].sort()[0] ?? null;
}

export interface ProposeEditPayload {
    instruction: string;
    section: {
        id: string;
        type: SectionKey;
        variant: string;
        brief: string;
        props: Record<string, unknown>;
    };
}

/** C-03: this only asks for a suggestion. Keeping it is a separate editor action. */
export async function proposeProjectEdit(
    projectId: string,
    payload: ProposeEditPayload,
): Promise<{ proposal: EditProposal | null; error: string | null }> {
    const { data, error, detail } = await apiPost<EditProposal>(
        `${projectUrl(projectId)}/edits`,
        payload,
    );

    if (error || !data) {
        return { proposal: null, error: detail?.trim() || error || EMPTY_REPLY };
    }
    return { proposal: data, error: null };
}

export interface GenerationJobStatus {
    status: 'queued' | 'planning' | 'streaming' | 'validating' | 'repairing' | 'done' | 'failed';
    sections_done: number;
    sections_total: number;
    provider?: string;
    elapsed_ms: number;
    fallback_template_id?: string;
    error?: string;
    composition?: Composition;
    files_ready: boolean;
    planned_sections?: string[];
    preview_html?: string;
    variants?: { id: string; html?: string }[];
}

/** Starts a full-site job. persist:false keeps files off the tree until Keep. */
export async function startProjectGenerate(
    projectId: string,
    prompt: string,
): Promise<{ jobId: string | null; error: string | null }> {
    const { data, error } = await apiPost<{ job_id: string }>(
        `${projectUrl(projectId)}/generate`,
        { prompt, persist: false },
    );

    if (error || !data?.job_id) return { jobId: null, error: error ?? EMPTY_REPLY };
    return { jobId: data.job_id, error: null };
}

export interface CopyEditProposal {
    path: string;
    after: string;
    explanation: string;
    /** Extra HTML files changed in the same Ask turn (path → content). */
    files?: Record<string, string>;
}

export async function proposeCopyEdit(
    projectId: string,
    instruction: string,
): Promise<{ proposal: CopyEditProposal | null; error: string | null }> {
    const { data, error, detail } = await apiPost<CopyEditProposal>(
        `${projectUrl(projectId)}/copy-edits`,
        { instruction },
    );

    if (error || !data) {
        return { proposal: null, error: detail?.trim() || error || EMPTY_REPLY };
    }
    return { proposal: data, error: null };
}

export async function proposePageEdit(
    projectId: string,
    instruction: string,
    focusPath?: string | null,
): Promise<{ proposal: CopyEditProposal | null; error: string | null }> {
    const { data, error, detail } = await apiPost<CopyEditProposal>(
        `${projectUrl(projectId)}/page-edits`,
        { instruction, ...(focusPath ? { focusPath } : {}) },
    );

    if (error || !data) {
        return { proposal: null, error: detail?.trim() || error || EMPTY_REPLY };
    }
    return { proposal: data, error: null };
}

export async function loadGenerationJob(
    jobId: string,
): Promise<{ job: GenerationJobStatus | null; error: string | null }> {
    const { data, error } = await apiGet<GenerationJobStatus>(
        `/api/v1/jobs/${encodeURIComponent(jobId)}`,
    );

    if (error || !data) return { job: null, error: error ?? EMPTY_REPLY };
    return { job: data, error: null };
}

export async function startProjectPublish(
    projectId: string,
    idempotencyKey: string,
): Promise<{
    deploymentId: string | null;
    status: PublishProjectResponse['status'] | null;
    liveUrl: string | null;
    error: string | null;
}> {
    const { data, error } = await apiPostHeaders<PublishProjectResponse>(
        `${projectUrl(projectId)}/publish`,
        { 'Idempotency-Key': idempotencyKey },
    );

    if (error || !data) {
        return { deploymentId: null, status: null, liveUrl: null, error: error ?? EMPTY_REPLY };
    }
    return {
        deploymentId: data.deploymentId,
        status: data.status,
        liveUrl: data.liveUrl ?? null,
        error: data.error ?? null,
    };
}

export async function pollDeployment(
    deploymentId: string,
): Promise<{ deployment: DeploymentResponse | null; error: string | null }> {
    const { data, error } = await apiGet<DeploymentResponse>(
        `/api/v1/deployments/${encodeURIComponent(deploymentId)}`,
    );

    if (error || !data) return { deployment: null, error: error ?? EMPTY_REPLY };
    return { deployment: data, error: null };
}