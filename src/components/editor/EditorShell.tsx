'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/lib/editor-store';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useUpiPrompt } from '@/hooks/useUpiPrompt';
import { apiGet, apiPost } from '@/lib/api/client';
import type { JobStatus } from '@/lib/ai/jobs/types';
import { explainCreationIssue } from '@/lib/editor/ai-fix';
import TopBar from './TopBar';
import PreviewPane from './PreviewPane';
import FileTree from './FileTree';
import CodePane from './CodePane';
import { TreeSkeleton, PaneSkeleton } from './Skeletons';
import SectionsPanel from './SectionsPanel';
import VersionHistory from './VersionHistory';
import { GeneratingOverlay } from './GeneratingOverlay';
import ChatPanel from './ChatPanel';
import EditorSplit from './EditorSplit';
import { AskAiFixDialog } from './AskAiFixDialog';
import { NeedUpiDialog } from './NeedUpiDialog';

interface JobProgress {
    status: JobStatus;
    sections_done: number;
    sections_total: number;
    files_ready?: boolean;
    planned_sections?: string[];
    preview_html?: string;
    prompt?: string;
    error?: string;
    fallback_template_id?: string;
    composition?: { vertical?: string };
}

// A job that fell back reports `done`, because a site did get written and the editor does
// have something to open. What it is not is the site the person asked for, and the screen
// used to greet them as though it were. This is the sentence that says otherwise.
const FALLBACK_NOTICE =
    'I could not build a site from your description, so this is a ready-made design to start from — your details are not on it yet. Tell me what to change, or try describing it again.';

export default function EditorShell({
    projectId,
    jobId,
}: {
    projectId: string;
    jobId?: string;
}) {
    useUnsavedGuard();
    const router = useRouter();
    const [historyOpen, setHistoryOpen] = useState(false);
    const [generation, setGeneration] = useState<JobProgress | null>(
        jobId ? { status: 'queued', sections_done: 0, sections_total: 0 } : null,
    );
    const [focusAsk, setFocusAsk] = useState(() => {
        if (typeof window === 'undefined') return false;
        return new URLSearchParams(window.location.search).get('ask') === '1';
    });
    const [sectionsOpen, setSectionsOpen] = useState(false);
    const [loadAskOpen, setLoadAskOpen] = useState(false);
    const advanced = useEditorStore((s) => s.advanced);
    const loading = useEditorStore((s) => s.loading);
    const loadError = useEditorStore((s) => s.loadError);
    const loadProject = useEditorStore((s) => s.loadProject);
    const setGenerationNotice = useEditorStore((s) => s.setGenerationNotice);
    const saveProject = useEditorStore((s) => s.saveProject);
    const flushPendingSave = useEditorStore((s) => s.flushPendingSave);
    const composition = useEditorStore((s) => s.composition);
    const pendingChange = useEditorStore((s) => s.pendingChange);
    const rejectChange = useEditorStore((s) => s.rejectChange);
    const requestAiEdit = useEditorStore((s) => s.requestAiEdit);
    const siteMeta = useEditorStore((s) => s.siteMeta);
    const vfs = useEditorStore((s) => s.vfs);

    const upi = useUpiPrompt({
        projectId,
        prompt: generation?.prompt,
        html: generation?.preview_html ?? vfs.read('index.html'),
        vertical: generation?.composition?.vertical ?? composition?.vertical,
        enabled: !jobId || generation?.status === 'done' || generation?.status === 'failed',
    });

    useEffect(() => {
        if (jobId) return;
        loadProject(projectId);
        return () => flushPendingSave();
    }, [projectId, jobId, loadProject, flushPendingSave]);

    useEffect(() => {
        if (!jobId) return;

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const poll = async () => {
            const { data, error } = await apiGet<JobProgress>(
                `/api/v1/jobs/${encodeURIComponent(jobId)}`,
            );
            if (cancelled) return;

            if (error || !data) {
                await loadProject(projectId);
                if (cancelled) return;
                setGeneration(null);
                router.replace(`/editor/${encodeURIComponent(projectId)}`);
                return;
            }

            setGeneration(data);

            if (data.status === "done" || data.status === "failed") {
                setGenerationNotice(data.fallback_template_id ? FALLBACK_NOTICE : null);
                await loadProject(projectId);
                if (cancelled) return;
                // Only go to /choose when there are variant looks to pick from.
                // A fallback job wrote a template directly — no looks exist, so
                // sending the user to /choose would bounce them straight back here.
                if (data.status === "done" && !data.fallback_template_id) {
                    router.replace(
                        `/choose/${encodeURIComponent(projectId)}?job=${encodeURIComponent(jobId)}`,
                    );
                    return;
                }
                // For fallback or failed jobs, clear the generation overlay and
                // settle on the editor with whatever the project now holds.
                setGeneration(null);
                router.replace(`/editor/${encodeURIComponent(projectId)}`);
                return;
            }

            timer = setTimeout(poll, 1500);
        };

        void poll();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [jobId, projectId, loadProject, router, setGenerationNotice]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                saveProject({ commit: true });
                return;
            }
            if (e.key === 'Escape') {
                if (pendingChange) {
                    e.preventDefault();
                    rejectChange();
                    return;
                }
                setHistoryOpen(false);
                setSectionsOpen(false);
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [saveProject, pendingChange, rejectChange]);

    const generating = Boolean(generation && generation.status !== 'failed');
    const loadFix = loadError ? explainCreationIssue(loadError, 'load') : null;

    async function retryGeneration(instruction: string) {
        const prompt = (generation?.prompt ?? instruction).trim();
        if (!prompt) return;
        const started = await apiPost<{ job_id: string }>(
            `/api/v1/projects/${encodeURIComponent(projectId)}/generate`,
            { prompt },
        );
        if (started.data?.job_id) {
            router.replace(
                `/editor/${encodeURIComponent(projectId)}?job=${encodeURIComponent(started.data.job_id)}`,
            );
            return;
        }
        void requestAiEdit(instruction);
    }

    return (
        <div className="flex h-screen flex-col bg-background/80 backdrop-blur-xl">
            <a
                href="#editor-preview"
                className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:text-primary-foreground"
            >
                Skip to preview
            </a>
            <TopBar
                projectId={projectId}
                hasComposition={!!composition}
                sectionsOpen={sectionsOpen}
                onToggleSections={() => setSectionsOpen((open) => !open)}
                historyOpen={historyOpen}
                onToggleHistory={() => setHistoryOpen((open) => !open)}
            />
            {loadError && !generating ? (
                <div className="flex flex-1 items-center justify-center p-8">
                    <div className="max-w-sm text-center">
                        <p className="text-sm font-medium">{loadFix?.title ?? 'This project could not be opened.'}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {loadFix?.what ?? loadError}
                        </p>
                        <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                            <button
                                type="button"
                                onClick={() => loadProject(projectId)}
                                className="h-11 cursor-pointer rounded-full border border-border px-4 text-sm hover:bg-muted"
                            >
                                Try again
                            </button>
                            <button
                                type="button"
                                onClick={() => setLoadAskOpen(true)}
                                className="h-11 cursor-pointer rounded-full border border-gold bg-gold px-4 text-sm font-semibold text-gold-foreground hover:opacity-90"
                            >
                                Fix with AI
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <main className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
                    {generation && (
                        <GeneratingOverlay
                            status={generation.status}
                            sectionsDone={generation.sections_done}
                            sectionsTotal={generation.sections_total}
                            filesReady={Boolean(generation.files_ready)}
                            plannedSections={generation.planned_sections ?? []}
                            previewHtml={generation.preview_html}
                            prompt={generation.prompt}
                            error={generation.error}
                            onAskAiFix={(instruction) => void retryGeneration(instruction)}
                        />
                    )}
                    {sectionsOpen && composition && (
                        <aside className="w-64 shrink-0 overflow-auto border-r border-border/60">
                            {loading ? <TreeSkeleton /> : <SectionsPanel />}
                        </aside>
                    )}
                    {advanced ? (
                        <>
                            <aside className="w-56 shrink-0 overflow-auto border-r border-border/60">
                                {loading ? <TreeSkeleton /> : <FileTree />}
                            </aside>
                            <section className="min-w-0 flex-1 overflow-auto border-r border-border/60">
                                {loading ? <PaneSkeleton /> : <CodePane />}
                            </section>
                            <section className="relative min-h-0 min-w-0 flex-1">
                                {loading ? <PaneSkeleton /> : <PreviewPane />}
                            </section>
                            {pendingChange ? (
                                <aside className="flex w-[min(100%,24rem)] shrink-0 flex-col overflow-hidden border-l border-border/60">
                                    {loading ? <PaneSkeleton /> : <ChatPanel autoFocus={focusAsk} />}
                                </aside>
                            ) : null}
                        </>
                    ) : (
                        <EditorSplit
                            left={loading || generating ? <PaneSkeleton /> : <ChatPanel autoFocus={focusAsk} />}
                            right={loading || generating ? <PaneSkeleton /> : <PreviewPane />}
                        />
                    )}
                    {historyOpen && (
                        <aside className="w-72 shrink-0 overflow-hidden border-l border-border/60">
                            <VersionHistory />
                        </aside>
                    )}
                </main>
            )}

            {loadFix ? (
                <AskAiFixDialog
                    open={loadAskOpen}
                    title={loadFix.title}
                    what={loadFix.what}
                    onDismiss={() => setLoadAskOpen(false)}
                    onConfirm={() => {
                        setLoadAskOpen(false);
                        void loadProject(projectId);
                        void requestAiEdit(loadFix.instruction);
                    }}
                />
            ) : null}

            <NeedUpiDialog
                open={upi.open && !siteMeta.upiId}
                busy={upi.busy}
                error={upi.error}
                onDismiss={upi.dismiss}
                onConfirm={(id) => {
                    void upi.save(id).then((ok) => {
                        if (ok) void loadProject(projectId);
                    });
                }}
            />
        </div>
    );
}
