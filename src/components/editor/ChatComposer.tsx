'use client';

import { FormEvent, useRef, useState, useSyncExternalStore } from 'react';
import { Globe, Loader2, Plus, Square, X } from 'lucide-react';

import { DictationButton } from '@/components/ui/DictationButton';
import { cn } from '@/lib/utils';

const DOMAIN_BANNER_KEY = 'pagecraft.editor.domainBanner';

export interface ChatAttachment {
    id: string;
    name: string;
    url: string;
}

function domainBannerVisible(): boolean {
    try {
        return window.localStorage.getItem(DOMAIN_BANNER_KEY) !== '1';
    } catch {
        return true;
    }
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
    const persistBanner = useSyncExternalStore(
        () => () => {},
        domainBannerVisible,
        () => false,
    );
    const [dismissed, setDismissed] = useState(false);
    const [domainNote, setDomainNote] = useState(false);
    const banner = persistBanner && !dismissed;

    function dismissBanner() {
        setDismissed(true);
        setDomainNote(false);
        try {
            window.localStorage.setItem(DOMAIN_BANNER_KEY, '1');
        } catch {
            /* session-only hide is enough if storage is blocked */
        }
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        onSubmit();
    }

    const inputLocked = busy || locked || uploadingFiles;
    const canSend = !inputLocked && (draft.trim() || attachments.length > 0);

    return (
        <div className="glass-panel overflow-hidden rounded-3xl">
            {banner ? (
                <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
                    <Globe
                        className="size-4 shrink-0 text-muted-foreground"
                        strokeWidth={1.75}
                        aria-hidden
                    />
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                        Set up a custom domain
                    </p>
                    <button
                        type="button"
                        onClick={() => setDomainNote((open) => !open)}
                        aria-expanded={domainNote}
                        className="cursor-pointer rounded-full border border-gold bg-gold px-3 py-1 text-xs font-semibold text-gold-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    >
                        Get started
                    </button>
                    <button
                        type="button"
                        onClick={dismissBanner}
                        aria-label="Hide domain setup"
                        title="Hide for now"
                        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <X className="size-4" strokeWidth={1.75} />
                    </button>
                </div>
            ) : null}

            {banner && domainNote ? (
                <p className="border-b border-border/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    Custom domains are coming. For now your site lives on a PageCrafts
                    address — we will let you know when you can point your own name at it.
                </p>
            ) : null}

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
                    maxLength={500}
                    rows={2}
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
