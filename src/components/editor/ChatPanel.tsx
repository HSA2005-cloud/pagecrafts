'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/lib/editor-store';
import { chatSuggestions } from '@/lib/editor/chat-suggestions';
import {
    editSuggestionSteps,
    generationSteps,
    generationThought,
} from '@/lib/editor/generation-steps';
import { explainCreationIssue } from '@/lib/editor/ai-fix';
import { uploadProjectImage } from '@/lib/project-source';
import ChangeSummary from './ChangeSummary';
import ChatComposer, { type ChatAttachment } from './ChatComposer';
import { GenerationTimeline } from './GenerationTimeline';
import { AskAiFixDialog } from './AskAiFixDialog';

function messageWithAttachments(text: string, attachments: ChatAttachment[]): string {
    const trimmed = text.trim();
    if (attachments.length === 0) return trimmed;

    const refs = attachments
        .map((item) => `[Attached image "${item.name}": ${item.url}]`)
        .join('\n');

    if (!trimmed) {
        return attachments.length === 1
            ? `Use the attached image: ${attachments[0].url}`
            : `Use these attached images:\n${refs}`;
    }
    return `${trimmed}\n\n${refs}`;
}

export default function ChatPanel({ autoFocus = false }: { autoFocus?: boolean }) {
    const composition = useEditorStore((s) => s.composition);
    const contentSchema = useEditorStore((s) => s.contentSchema);
    const projectId = useEditorStore((s) => s.projectId);
    const requestAiEdit = useEditorStore((s) => s.requestAiEdit);
    const cancelAiEdit = useEditorStore((s) => s.cancelAiEdit);
    const messages = useEditorStore((s) => s.chatMessages);
    const busy = useEditorStore((s) => s.chatBusy);
    const error = useEditorStore((s) => s.chatError);
    const progress = useEditorStore((s) => s.chatProgress);
    const chatJob = useEditorStore((s) => s.chatJob);
    const pendingChange = useEditorStore((s) => s.pendingChange);
    const hasSections = (composition?.sections.length ?? 0) > 0;

    const [draft, setDraft] = useState('');
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
    const [uploadingFiles, setUploadingFiles] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);
    const [askOpen, setAskOpen] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    const lastUserText = [...messages].reverse().find((turn) => turn.role === 'user')?.text ?? null;
    const hasPage = Boolean(contentSchema?.sections.length);
    const suggestions = chatSuggestions({ composition, lastUserText, hasPage });
    const showChoices = !busy && !pendingChange;
    const fix = error ? explainCreationIssue(error, 'chat') : null;

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [messages, busy, pendingChange, error]);

    async function send(text: string) {
        const next = messageWithAttachments(text, attachments).trim();
        if (!next || busy) return;
        setDraft('');
        setAttachments([]);
        setFileError(null);
        await requestAiEdit(next);
    }

    const pickFiles = useCallback(
        async (files: FileList) => {
            if (!projectId || busy || pendingChange || uploadingFiles) return;

            setFileError(null);
            setUploadingFiles(true);

            for (const file of Array.from(files)) {
                const { asset, error } = await uploadProjectImage(projectId, file);
                const url = asset?.url;
                if (error || !url) {
                    setFileError(error ?? 'That image could not be uploaded.');
                    continue;
                }
                setAttachments((current) => [
                    ...current,
                    { id: asset.id, name: file.name, url },
                ]);
            }

            setUploadingFiles(false);
        },
        [projectId, busy, pendingChange, uploadingFiles],
    );

    return (
        <section aria-label="Ask for a change" className="relative flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-auto px-5 pb-44 pt-6 sm:px-7">
                {messages.length === 0 && !busy ? (
                    <p className="max-w-md text-sm leading-6 text-muted-foreground">
                        {hasPage
                            ? 'Describe a change, or pick a suggestion. Nothing is applied until you keep it.'
                            : hasSections
                              ? 'Describe a change, or pick a suggestion. You can also ask for a whole new website. Nothing is applied until you keep it.'
                              : 'Describe the website you want, or pick a suggestion. Nothing is applied until you keep it.'}
                    </p>
                ) : (
                    <ol className="space-y-4">
                        {messages.map((turn, index) => (
                            <li key={`${turn.role}-${index}`}>
                                {turn.role === 'user' ? (
                                    <div className="ml-auto max-w-[85%] rounded-2xl bg-accent px-4 py-3 text-sm leading-6 text-foreground">
                                        <p className="sr-only">You</p>
                                        <p>{turn.text}</p>
                                    </div>
                                ) : (
                                    <div className="max-w-[90%] text-sm leading-6 text-foreground">
                                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                            Suggestion
                                        </p>
                                        <p className="mt-1">{turn.text}</p>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>
                )}

                {busy ? (
                    <div className="mt-4">
                        <GenerationTimeline
                            compact
                            steps={
                                chatJob
                                    ? generationSteps({
                                        status: chatJob.status,
                                        sectionsDone: chatJob.sections_done,
                                        sectionsTotal: chatJob.sections_total,
                                        filesReady: chatJob.files_ready,
                                        plannedSections: chatJob.planned_sections,
                                        variantCount: chatJob.variants?.length,
                                    })
                                    : editSuggestionSteps(true)
                            }
                            thought={
                                chatJob
                                    ? generationThought({
                                        status: chatJob.status,
                                        sectionsDone: chatJob.sections_done,
                                        sectionsTotal: chatJob.sections_total,
                                        filesReady: chatJob.files_ready,
                                        plannedSections: chatJob.planned_sections,
                                        variantCount: chatJob.variants?.length,
                                    })
                                    : (progress || 'Drafting a change.')
                            }
                        />
                    </div>
                ) : null}

                {fix ? (
                    <div className="mt-4 rounded-2xl border border-border/70 bg-card/80 p-4">
                        <p className="text-sm font-medium text-foreground">{fix.title}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{fix.what}</p>
                        <button
                            type="button"
                            onClick={() => setAskOpen(true)}
                            className="mt-3 h-11 cursor-pointer rounded-full border border-gold bg-gold px-4 text-sm font-semibold text-gold-foreground hover:opacity-90"
                        >
                            Fix with AI
                        </button>
                    </div>
                ) : null}

                {fileError ? (
                    <p role="alert" className="mt-4 text-sm text-destructive">
                        {fileError}
                    </p>
                ) : null}

                {showChoices && suggestions.length > 0 ? (
                    <ul className="mt-6 flex flex-wrap gap-2" aria-label="Suggested next steps">
                        {suggestions.map((item) => (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (item.compose) {
                                            document.getElementById('editor-follow-up')?.focus();
                                            return;
                                        }
                                        void send(item.send ?? item.label);
                                    }}
                                    className="cursor-pointer rounded-full border border-border bg-card/70 px-3.5 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {item.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : null}

                <div className="mt-4">
                    <ChangeSummary />
                </div>
                <div ref={endRef} />
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-4 sm:px-6">
                <div className="pointer-events-auto">
                    <ChatComposer
                        draft={draft}
                        onDraftChange={setDraft}
                        onSubmit={() => void send(draft)}
                        onStop={cancelAiEdit}
                        onPickFiles={(files) => void pickFiles(files)}
                        attachments={attachments}
                        onRemoveAttachment={(id) =>
                            setAttachments((current) => current.filter((item) => item.id !== id))
                        }
                        uploadingFiles={uploadingFiles}
                        busy={busy}
                        locked={!!pendingChange}
                        autoFocus={autoFocus}
                    />
                </div>
            </div>

            {fix ? (
                <AskAiFixDialog
                    open={askOpen}
                    title={fix.title}
                    what={fix.what}
                    busy={busy}
                    onDismiss={() => setAskOpen(false)}
                    onConfirm={() => {
                        setAskOpen(false);
                        void send(fix.instruction);
                    }}
                />
            ) : null}
        </section>
    );
}
