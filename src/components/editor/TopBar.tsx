'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useEditorStore } from '@/lib/editor-store';

function statusLine(saving: boolean, saveError: string | null, unsaved: number, savedAt: string | null) {
    if (saving) return { text: 'Saving…', tone: 'muted' as const };
    if (saveError) return { text: saveError, tone: 'error' as const };
    if (unsaved > 0)
        return { text: `${unsaved} unsaved ${unsaved === 1 ? 'change' : 'changes'}`, tone: 'muted' as const };
    if (savedAt) return { text: 'All changes saved', tone: 'muted' as const };
    return null;
}

interface TopBarProps {
    projectId: string;
    hasComposition: boolean;
    sectionsOpen: boolean;
    onToggleSections: () => void;
    historyOpen: boolean;
    onToggleHistory: () => void;
}

export default function TopBar({
    projectId,
    hasComposition,
    sectionsOpen,
    onToggleSections,
    historyOpen,
    onToggleHistory,
}: TopBarProps) {
    const advanced = useEditorStore((s) => s.advanced);
    const toggleAdvanced = useEditorStore((s) => s.toggleAdvanced);
    const dirtyPaths = useEditorStore((s) => s.dirtyPaths);
    const saveProject = useEditorStore((s) => s.saveProject);
    const saving = useEditorStore((s) => s.saving);
    const saveError = useEditorStore((s) => s.saveError);
    const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
    const projectName = useEditorStore((s) => s.projectName);
    const contentError = useEditorStore((s) => s.contentError);

    const status = statusLine(saving, saveError, dirtyPaths.length, lastSavedAt);

    return (
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 bg-background/50 px-4 backdrop-blur-xl">
            <span className="truncate text-sm font-medium" title={projectName ?? projectId}>
                {projectName ?? projectId}
            </span>
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
                {status && (
                    <span
                        className={
                            status.tone === 'error'
                                ? 'max-w-xs truncate text-xs text-destructive'
                                : 'mr-1 text-xs text-muted-foreground'
                        }
                        title={status.text}
                    >
                        {status.text}
                    </span>
                )}
                {contentError && (
                    <span
                        className="max-w-xs truncate text-xs text-destructive"
                        title={contentError}
                    >
                        {contentError}
                    </span>
                )}
                {hasComposition && (
                    <button
                        type="button"
                        onClick={onToggleSections}
                        aria-pressed={sectionsOpen}
                        className="h-11 cursor-pointer rounded-full border border-border px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Sections
                    </button>
                )}
                <button
                    type="button"
                    onClick={onToggleHistory}
                    aria-pressed={historyOpen}
                    className="h-11 cursor-pointer rounded-full border border-border px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Versions
                </button>
                <button
                    type="button"
                    onClick={toggleAdvanced}
                    className="h-11 cursor-pointer rounded-full border border-border px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {advanced ? 'Exit Advanced' : 'Advanced'}
                </button>
                <Link
                    href="/#build"
                    className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ArrowLeft className="size-4 shrink-0" aria-hidden />
                    Back to Templates
                </Link>
                <button
                    type="button"
                    disabled={dirtyPaths.length === 0 || saving}
                    onClick={() => saveProject({ commit: true })}
                    className="h-11 cursor-pointer rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </header>
    );
}
