'use client';

import { FormEvent, useRef } from 'react';
import { Loader2, Plus, Square, X } from 'lucide-react';
import { MAX_INSTRUCTION_CHARS } from '@/lib/contracts';

import { DictationButton } from '@/components/ui/DictationButton';
import { cn } from '@/lib/utils';

export interface ChatAttachment {
    id: string;
    name: string;
    url: string;
}

export default function ChatComposer({
    draft,
    onDraftChange,
    onSubmit,
    onStop,
    onPickFiles,
    attachments,
    onRemoveAttachment,
    uploadingFiles,
    busy,
    locked,
    autoFocus,
}: {
    draft: string;
    onDraftChange: (value: string) => void;
    onSubmit: () => void;
    onStop: () => void;
    onPickFiles: (files: FileList) => void;
    attachments: ChatAttachment[];
    onRemoveAttachment: (id: string) => void;
    uploadingFiles: boolean;
    busy: boolean;
    locked: boolean;
    autoFocus?: boolean;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        onSubmit();
    }

    const inputLocked = busy || locked || uploadingFiles;
    const canSend = !inputLocked && (draft.trim() || attachments.length > 0);

    return (
        <div className="glass-panel overflow-hidden rounded-3xl">
            <form onSubmit={handleSubmit} className="bg-field/70 px-3 pb-2 pt-3">
                {attachments.length > 0 ? (
                    <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attached images">
                        {attachments.map((item) => (
                            <li key={item.id}>
                                <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card/80 py-1 pl-1 pr-2 text-xs text-foreground">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={item.url}
                                        alt=""
                                        className="size-7 rounded-full object-cover"
                                    />
                                    <span className="max-w-[8rem] truncate">{item.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => onRemoveAttachment(item.id)}
                                        disabled={inputLocked}
                                        aria-label={`Remove ${item.name}`}
                                        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <X className="size-3" strokeWidth={2} />
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : null}

                <label className="sr-only" htmlFor="editor-follow-up">
                    Describe a change
                </label>
                <textarea
                    id="editor-follow-up"
                    value={draft}
                    onChange={(e) => onDraftChange(e.target.value)}
                    maxLength={MAX_INSTRUCTION_CHARS}
                    rows={2}
                    aria-describedby="editor-follow-up-count"
                    autoFocus={autoFocus}
                    disabled={inputLocked}
                    placeholder="Queue follow-up…"
                    aria-label="Change request"
                    className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (canSend) onSubmit();
                        }
                    }}
                />
                {/* Silence was the bug: a long paste was accepted here and refused by the
                    route, with nothing on screen to say why. */}
                <p
                    id="editor-follow-up-count"
                    aria-live="polite"
                    className={`mt-1 text-right text-[11px] ${
                        draft.length >= MAX_INSTRUCTION_CHARS
                            ? 'text-destructive'
                            : draft.length > MAX_INSTRUCTION_CHARS * 0.8
                                ? 'text-foreground/70'
                                : 'text-muted-foreground/60'
                    }`}
                >
                    {draft.length >= MAX_INSTRUCTION_CHARS
                        ? `${MAX_INSTRUCTION_CHARS} character limit reached — send this, then ask for the next change`
                        : draft.length > MAX_INSTRUCTION_CHARS * 0.8
                            ? `${draft.length} of ${MAX_INSTRUCTION_CHARS} characters`
                            : ''}
                </p>
                <div className="mt-1 flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={inputLocked}
                        title="Add an image"
                        aria-label="Add an image"
                        className="flex size-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {uploadingFiles ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                            <Plus className="size-4" strokeWidth={1.75} />
                        )}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            const files = e.target.files;
                            e.target.value = '';
                            if (files?.length) onPickFiles(files);
                        }}
                    />
                    <span className="flex-1" />
                    <button
                        type="submit"
                        disabled={!canSend}
                        className="h-11 cursor-pointer rounded-full border border-gold bg-gold px-4 text-sm font-semibold text-gold-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {busy ? 'Sending…' : 'Send'}
                    </button>
                    <DictationButton
                        disabled={inputLocked}
                        label="Speak a change"
                        onTranscript={(spoken) => {
                            const next = spoken.trim();
                            if (!next) return;
                            onDraftChange(draft.trim() ? `${draft.trim()} ${next}` : next);
                        }}
                    />
                    <button
                        type="button"
                        onClick={onStop}
                        disabled={!busy}
                        aria-label={busy ? 'Stop preparing a suggestion' : 'Nothing to stop'}
                        title={busy ? 'Stop' : 'Nothing to stop'}
                        className={cn(
                            'flex size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            busy
                                ? 'cursor-pointer bg-foreground text-background hover:opacity-90'
                                : 'cursor-not-allowed text-muted-foreground opacity-40',
                        )}
                    >
                        <Square className="size-3.5 fill-current" />
                    </button>
                </div>
            </form>
        </div>
    );
}
