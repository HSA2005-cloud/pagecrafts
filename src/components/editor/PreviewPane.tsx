'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { useEditorStore } from '@/lib/editor-store';
import { assemblePreview, injectErrorHook } from '@/lib/preview';
import { PREVIEW_IFRAME_SANDBOX, withPreviewCsp } from '@/lib/preview-security';
import { friendlyPreviewIssue } from '@/lib/editor/preview-copy';
import { previewDocumentUrl } from '@/lib/editor/preview-frame';
import { filesForPreview } from '@/lib/editor/preview-files';
import { sectionLabel } from '@/lib/editor/section-registry';
import { htmlPagesOf } from '@/lib/ai/generate/pages';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 120;

type Viewport = 'full' | 'phone';

export default function PreviewPane() {
    const vfs = useEditorStore((s) => s.vfs);
    const dirtyPaths = useEditorStore((s) => s.dirtyPaths);
    const tree = useEditorStore((s) => s.tree);
    const pendingChange = useEditorStore((s) => s.pendingChange);
    const composition = useEditorStore((s) => s.composition);
    const selectedSectionId = useEditorStore((s) => s.selectedSectionId);
    const selectSection = useEditorStore((s) => s.selectSection);

    const frame = useRef<HTMLIFrameElement>(null);
    const [viewport, setViewport] = useState<Viewport>('full');
    const [reloadTick, setReloadTick] = useState(0);
    const [entry, setEntry] = useState('index.html');
    const [preview, setPreview] = useState(() => {
        const r = assemblePreview(vfs.toMap(), 'index.html');
        return { doc: withPreviewCsp(injectErrorHook(r.html)), warnings: r.warnings };
    });
    const [runtimeError, setRuntimeError] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const last = useRef(preview.doc);

    useEffect(() => {
        const t = setTimeout(() => {
            const map = filesForPreview(vfs.toMap(), pendingChange);
            const pages = htmlPagesOf(map);
            const current = pages.includes(entry) ? entry : (pages[0] ?? 'index.html');
            if (current !== entry) setEntry(current);
            const r = assemblePreview(map, current);
            const next = withPreviewCsp(injectErrorHook(r.html));
            if (next === last.current) return;
            last.current = next;
            setPreview({ doc: next, warnings: r.warnings });
            setRuntimeError(null);
            setDismissed(false);
        }, DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [vfs, dirtyPaths, tree, pendingChange, reloadTick, entry]);

    const frameUrl = useMemo(() => previewDocumentUrl(preview.doc), [preview.doc]);

    useEffect(() => {
        return () => {
            if (frameUrl) URL.revokeObjectURL(frameUrl);
        };
    }, [frameUrl]);

    useEffect(() => {
        function onMessage(e: MessageEvent) {
            if (e.source !== frame.current?.contentWindow) return;
            const data = e.data as { __pagecraft?: boolean; message?: string; kind?: string; path?: string };
            if (!data?.__pagecraft) return;
            if (data.kind === 'navigate' && typeof data.path === 'string' && data.path.trim()) {
                last.current = '';
                setEntry(data.path.trim());
                return;
            }
            if (data.message) setRuntimeError(data.message);
        }
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, []);

    const issues = [...preview.warnings, ...(runtimeError ? [runtimeError] : [])]
        .map(friendlyPreviewIssue);
    const uniqueIssues = [...new Set(issues)];
    const htmlPages = htmlPagesOf(vfs.toMap());
    const showNotice = uniqueIssues.length > 0 && !dismissed;
    const empty = !preview.doc.trim();
    const sections = composition?.sections ?? [];

    return (
        <div id="editor-preview" className="flex h-full min-h-0 w-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3">
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Preview
                </span>
                <div className="flex items-center gap-0.5">
                    <button
                        type="button"
                        aria-label="Desktop"
                        aria-pressed={viewport === 'full'}
                        title="Desktop"
                        onClick={() => setViewport('full')}
                        className={cn(
                            'flex size-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            viewport === 'full'
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground hover:bg-muted',
                        )}
                    >
                        <Monitor className="size-4" strokeWidth={1.75} />
                    </button>
                    <button
                        type="button"
                        aria-label="Phone"
                        aria-pressed={viewport === 'phone'}
                        title="Phone"
                        onClick={() => setViewport('phone')}
                        className={cn(
                            'flex size-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            viewport === 'phone'
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground hover:bg-muted',
                        )}
                    >
                        <Smartphone className="size-4" strokeWidth={1.75} />
                    </button>
                    <button
                        type="button"
                        aria-label="Refresh preview"
                        title="Refresh"
                        onClick={() => {
                            last.current = '';
                            setReloadTick((n) => n + 1);
                        }}
                        className="flex size-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <RefreshCw className="size-4" strokeWidth={1.75} />
                    </button>
                </div>
                {htmlPages.length > 1 ? (
                    <label className="min-w-0">
                        <span className="sr-only">Page</span>
                        <select
                            value={htmlPages.includes(entry) ? entry : htmlPages[0]}
                            onChange={(e) => {
                                last.current = '';
                                setEntry(e.target.value);
                            }}
                            className="h-11 max-w-40 cursor-pointer truncate rounded-full border border-border bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {htmlPages.map((path) => (
                                <option key={path} value={path}>
                                    {path.replace(/\.html?$/i, '') || 'home'}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
                {sections.length > 0 ? (
                    <label className="ml-auto min-w-0">
                        <span className="sr-only">Page section</span>
                        <select
                            value={selectedSectionId ?? ''}
                            onChange={(e) => selectSection(e.target.value)}
                            className="h-11 max-w-48 cursor-pointer truncate rounded-full border border-border bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {sections.map((section) => (
                                <option key={section.id} value={section.id}>
                                    {sectionLabel(section.type)}
                                    {section.locked ? ' (locked)' : ''}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : (
                    <span className="ml-auto truncate text-xs text-muted-foreground">Homepage</span>
                )}
            </header>

            <div className="relative min-h-0 flex-1 overflow-hidden p-3">
                <div
                    className={
                        viewport === 'phone'
                            ? 'relative mx-auto h-full w-[min(100%,390px)] overflow-hidden rounded-xl border border-border bg-card shadow-lg'
                            : 'relative h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm'
                    }
                >
                    {empty || !frameUrl ? (
                        <div className="flex h-full items-center justify-center p-6">
                            <p className="max-w-xs text-center text-sm text-muted-foreground">
                                Your site will show up here as you edit.
                            </p>
                        </div>
                    ) : (
                        <iframe
                            key={reloadTick}
                            ref={frame}
                            title="Your site"
                            sandbox={PREVIEW_IFRAME_SANDBOX}
                            src={frameUrl}
                            className="pointer-events-auto absolute inset-0 z-0 h-full w-full border-0 bg-card"
                        />
                    )}
                </div>

                {showNotice && !empty && (
                    <div
                        role="status"
                        className="pointer-events-auto absolute inset-x-6 bottom-6 z-10 rounded-md border border-border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-medium">Could not show the whole page</p>
                                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                    {uniqueIssues.slice(0, 2).map((m, i) => (
                                        <li key={i} className="truncate">{m}</li>
                                    ))}
                                </ul>
                            </div>
                            <button
                                onClick={() => setDismissed(true)}
                                aria-label="Dismiss"
                                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
