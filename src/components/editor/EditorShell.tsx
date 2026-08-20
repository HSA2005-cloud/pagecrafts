'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/lib/editor-store';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { apiGet } from '@/lib/api/client';
import type { JobStatus } from '@/lib/ai/jobs/types';
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

interface JobProgress {
    status: JobStatus;
    sections_done: number;
    sections_total: number;
    files_ready?: boolean;
    planned_sections?: string[];
    preview_html?: string;
    prompt?: string;
    error?: string;
}

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
    const [focusAsk, setFocusAsk] = useState(false);
    const [sectionsOpen, setSectionsOpen] = useState(false);
    const advanced = useEditorStore((s) => s.advanced);
    const loading = useEditorStore((s) => s.loading);
    const loadError = useEditorStore((s) => s.loadError);
    const loadProject = useEditorStore((s) => s.loadProject);
    const saveProject = useEditorStore((s) => s.saveProject);
    const flushPendingSave = useEditorStore((s) => s.flushPendingSave);
    const composition = useEditorStore((s) => s.composition);
    const pendingChange = useEditorStore((s) => s.pendingChange);
    const rejectChange = useEditorStore((s) => s.rejectChange);

    // Arriving from /assistant, where the person has already said they want to ask for a
    // change. Opening the panel here rather than seeding useState keeps the first render the
    // same on the server and the client; a mismatched boolean would be a hydration warning
    // for the sake of one frame. Read once on mount, so it never fights the toggle afterwards.
    useEffect(() => {
        // The value can only be read from window, so it cannot be a useState initialiser
        // without the server and the client disagreeing on the first render. One extra
        // render on mount is the cost of not shipping a hydration mismatch, and it is paid
        // once — which is the paragraph above, and why the rule is suppressed rather than
        // obeyed here.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (new URLSearchParams(window.location.search).get('ask') === '1') setFocusAsk(true);
    }, []);

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
                await loadProject(projectId);
                if (cancelled) return;
                if (data.status === "done") {
                    router.replace(
                        `/choose/${encodeURIComponent(projectId)}?job=${encodeURIComponent(jobId)}`,
                    );
                    return;
                }
                return;
            }

            timer = setTimeout(poll, 400);
        };

        void poll();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [jobId, projectId, loadProject, router]);

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
                        <p className="text-sm font-medium">This project could not be opened.</p>
                        <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
                        <button
                            onClick={() => loadProject(projectId)}
                            className="mt-4 h-11 cursor-pointer rounded-full border border-border px-4 text-sm hover:bg-muted"
                        >
                            Try again
                        </button>
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
        </div>
    );
}
