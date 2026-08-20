'use client';
import { useEffect, useState } from 'react';
import { AlertCircle, History, Loader2, RotateCcw } from 'lucide-react';

import { useEditorStore } from '@/lib/editor-store';
import type { Commit, CommitAuthor } from '@/lib/contracts';

// Version history (V-1, FR-075). Going back is a move forward: restoring writes a new save
// point on top rather than erasing what came after, so a person who restores to Monday and
// then changes their mind still has Tuesday. The copy here says that, because the fear of
// losing work is what stops people using history at all.

const AUTHOR_LABEL: Record<CommitAuthor, string> = {
    user: 'You',
    ai_edit: 'An AI edit',
    system: 'PageCrafts',
};

function when(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';

    const minutes = Math.round((Date.now() - at.getTime()) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Row({ commit, isCurrent }: { commit: Commit; isCurrent: boolean }) {
    const restoreTo = useEditorStore((s) => s.restoreTo);
    const restoringSha = useEditorStore((s) => s.restoringSha);
    const [confirming, setConfirming] = useState(false);

    const busy = restoringSha === commit.sha;

    return (
        <li className="flex flex-col gap-1.5 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{commit.message}</p>
                    <p className="text-xs text-muted-foreground">
                        {AUTHOR_LABEL[commit.author]} · {when(commit.createdAt)}
                    </p>
                </div>

                {isCurrent ? (
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        Now
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        disabled={restoringSha !== null}
                        aria-label={`Go back to "${commit.message}"`}
                        className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-40"
                    >
                        {busy ? (
                            <Loader2 aria-hidden className="size-3 animate-spin" />
                        ) : (
                            <RotateCcw aria-hidden className="size-3" />
                        )}
                        Go back
                    </button>
                )}
            </div>

            {confirming && !busy && (
                <div className="rounded-md border border-border bg-muted/40 p-2">
                    <p className="text-xs text-muted-foreground">
                        This puts your site back to how it was here. Nothing is lost — the newer
                        versions stay in this list, so you can come forward again.
                    </p>
                    <div className="mt-2 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-background"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setConfirming(false);
                                void restoreTo(commit.sha);
                            }}
                            className="rounded-md bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                        >
                            Go back to here
                        </button>
                    </div>
                </div>
            )}
        </li>
    );
}

export default function VersionHistory() {
    const projectId = useEditorStore((s) => s.projectId);
    const history = useEditorStore((s) => s.history);
    const loading = useEditorStore((s) => s.historyLoading);
    const error = useEditorStore((s) => s.historyError);
    const loadHistory = useEditorStore((s) => s.loadHistory);
    const lastSavedAt = useEditorStore((s) => s.lastSavedAt);

    // Re-read after every save, so the list a person opens is not one save behind.
    useEffect(() => {
        if (projectId) void loadHistory();
    }, [projectId, lastSavedAt, loadHistory]);

    return (
        <section aria-label="Version history" className="flex h-full flex-col">
            <header className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2">
                <History aria-hidden className="size-3.5 text-muted-foreground" />
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Versions
                </h2>
                {loading && <Loader2 aria-hidden className="size-3 animate-spin text-muted-foreground" />}
            </header>

            {error ? (
                <div className="p-3">
                    <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
                        {error}
                    </p>
                    <button
                        onClick={() => void loadHistory()}
                        className="mt-2 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted"
                    >
                        Try again
                    </button>
                </div>
            ) : history.length === 0 && !loading ? (
                <p className="p-3 text-xs text-muted-foreground">
                    No versions yet. Every time you save, a version is kept here so you can come
                    back to it.
                </p>
            ) : (
                <ul className="flex-1 divide-y divide-border overflow-auto">
                    {history.map((commit, index) => (
                        <Row key={commit.sha} commit={commit} isCurrent={index === 0} />
                    ))}
                </ul>
            )}
        </section>
    );
}
