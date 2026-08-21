'use client';

import { useEffect, useMemo, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

import type { JobStatus } from '@/lib/ai/jobs/types';
import {
    generationSteps,
    generationThought,
} from '@/lib/editor/generation-steps';
import { explainCreationIssue } from '@/lib/editor/ai-fix';
import { PREVIEW_IFRAME_SANDBOX, withPreviewCsp } from '@/lib/preview-security';
import { previewDocumentUrl } from '@/lib/editor/preview-frame';
import { cn } from '@/lib/utils';
import { GenerationTimeline } from './GenerationTimeline';
import { AskAiFixDialog } from './AskAiFixDialog';

type Viewport = 'full' | 'phone';

export interface GenerationLook {
    id: string;
    label: string;
    html: string;
}

export function GeneratingOverlay({
    status,
    sectionsDone,
    sectionsTotal,
    filesReady = false,
    plannedSections = [],
    previewHtml,
    looks = [],
    prompt,
    error,
    onAskAiFix,
    className,
}: {
    status: JobStatus | 'loading';
    sectionsDone: number;
    sectionsTotal: number;
    filesReady?: boolean;
    plannedSections?: readonly string[];
    previewHtml?: string | null;
    looks?: readonly GenerationLook[];
    prompt?: string | null;
    error?: string | null;
    onAskAiFix?: (instruction: string) => void;
    className?: string;
}) {
    const readyLooks = looks.filter((look) => look.html.trim().length > 0);
    const [selectedLook, setSelectedLook] = useState<string | null>(null);
    const [viewport, setViewport] = useState<Viewport>('full');
    const [askOpen, setAskOpen] = useState(false);

    const activeLookId = selectedLook && readyLooks.some((look) => look.id === selectedLook)
        ? selectedLook
        : readyLooks[0]?.id ?? null;
    const html = (activeLookId
        ? readyLooks.find((look) => look.id === activeLookId)?.html
        : null) || previewHtml || '';

    const steps = generationSteps({
        status,
        sectionsDone,
        sectionsTotal,
        filesReady,
        plannedSections,
        variantCount: readyLooks.length,
    });
    const thought = error ? null : generationThought({
        status,
        sectionsDone,
        sectionsTotal,
        filesReady,
        plannedSections,
        variantCount: readyLooks.length,
    });
    const fix = error ? explainCreationIssue(error, 'generation') : null;

    return (
        <div
            className={cn(
                'z-20 flex min-h-0 flex-1 flex-col bg-background/70 backdrop-blur-xl lg:flex-row',
                className ?? 'absolute inset-0',
            )}
        >
            <aside className="flex max-h-[42vh] w-full shrink-0 flex-col overflow-auto border-b border-border/50 px-5 py-5 sm:px-6 lg:max-h-none lg:w-[min(100%,22rem)] lg:border-b-0 lg:border-r">
                <GenerationTimeline
                    steps={steps}
                    thought={thought}
                    prompt={prompt}
                />
                {fix ? (
                    <div className="mt-4 rounded-2xl border border-border/70 bg-card/80 p-4">
                        <p className="text-sm font-medium text-foreground">{fix.title}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{fix.what}</p>
                        {onAskAiFix ? (
                            <button
                                type="button"
                                onClick={() => setAskOpen(true)}
                                className="mt-3 h-11 w-full cursor-pointer rounded-full border border-gold bg-gold px-4 text-sm font-semibold text-gold-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                            >
                                Fix with AI
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </aside>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col p-3">
                <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
                    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/50 px-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Your site
                        </h2>
                        {readyLooks.length > 1 ? (
                            <div className="look-chunk-grid flex min-w-0 items-center gap-1 overflow-x-auto">
                                {readyLooks.map((look, i) => (
                                    <button
                                        key={look.id}
                                        type="button"
                                        aria-pressed={look.id === activeLookId}
                                        onClick={() => setSelectedLook(look.id)}
                                        className={cn(
                                            'look-chunk-card h-8 shrink-0 cursor-pointer rounded-full px-3 text-xs transition-colors',
                                            look.id === activeLookId
                                                ? 'bg-secondary text-foreground'
                                                : 'text-muted-foreground hover:bg-muted',
                                        )}
                                        style={{ animationDelay: `${i * 80}ms` }}
                                    >
                                        {look.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            aria-label="Full preview"
                            aria-pressed={viewport === 'full'}
                            onClick={() => setViewport('full')}
                            className={cn(
                                'flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors',
                                viewport === 'full'
                                    ? 'bg-secondary text-foreground'
                                    : 'text-muted-foreground hover:bg-muted',
                            )}
                        >
                            <Monitor className="size-4" strokeWidth={1.75} />
                        </button>
                        <button
                            type="button"
                            aria-label="Phone preview"
                            aria-pressed={viewport === 'phone'}
                            onClick={() => setViewport('phone')}
                            className={cn(
                                'flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors',
                                viewport === 'phone'
                                    ? 'bg-secondary text-foreground'
                                    : 'text-muted-foreground hover:bg-muted',
                            )}
                        >
                            <Smartphone className="size-4" strokeWidth={1.75} />
                        </button>
                    </div>
                    </header>

                    <LiveSitePreview html={html} viewport={viewport} />
                </div>
            </section>

            {fix && onAskAiFix ? (
                <AskAiFixDialog
                    open={askOpen}
                    title={fix.title}
                    what={fix.what}
                    onDismiss={() => setAskOpen(false)}
                    onConfirm={() => {
                        setAskOpen(false);
                        onAskAiFix(fix.instruction);
                    }}
                />
            ) : null}
        </div>
    );
}

function LiveSitePreview({ html, viewport }: { html: string; viewport: Viewport }) {
    const doc = useMemo(() => (html.trim() ? withPreviewCsp(html) : ''), [html]);
    const frameUrl = useMemo(() => previewDocumentUrl(doc), [doc]);

    useEffect(() => {
        return () => {
            if (frameUrl) URL.revokeObjectURL(frameUrl);
        };
    }, [frameUrl]);

    return (
        <div className="relative min-h-0 flex-1 overflow-hidden p-3">
            <div
                className={
                    viewport === 'phone'
                        ? 'relative mx-auto h-full w-[min(100%,390px)] overflow-hidden rounded-xl border border-border/60 bg-card'
                        : 'relative h-full min-h-[240px] w-full overflow-hidden rounded-xl border border-border/60 bg-card'
                }
            >
                {!frameUrl ? (
                    <div className="flex h-full flex-col justify-center gap-4 p-8">
                        <div className="mx-auto flex w-full max-w-md flex-col gap-3" aria-hidden>
                            <div className="h-8 w-1/3 rounded-md bg-muted" />
                            <div className="h-16 w-full rounded-xl bg-muted" />
                            <div className="grid grid-cols-3 gap-3">
                                <div className="h-20 rounded-lg bg-muted" />
                                <div className="h-20 rounded-lg bg-muted" />
                                <div className="h-20 rounded-lg bg-muted" />
                            </div>
                        </div>
                        <p className="text-center text-sm text-muted-foreground">
                            Your site will show up here as pages are written.
                        </p>
                    </div>
                ) : (
                    <iframe
                        title="Your site"
                        sandbox={PREVIEW_IFRAME_SANDBOX}
                        src={frameUrl}
                        className="absolute inset-0 h-full w-full border-0 bg-card"
                    />
                )}
            </div>
        </div>
    );
}
