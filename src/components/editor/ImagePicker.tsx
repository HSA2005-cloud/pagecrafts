'use client';
import { useCallback, useRef, useState } from 'react';
import { ImageOff, Loader2, Search, Upload } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { AssetAttribution, ImageSearchResult } from '@/lib/contracts';
import { pickUnsplashImage, searchImages, uploadProjectImage } from '@/lib/project-source';

// The image library (S-1). Every photo in a project comes through here or through the
// upload beside it — there is no paste-a-URL path, because a URL we did not fetch is a
// picture we cannot promise will still be there tomorrow, and a credit we cannot record.
//
// Searching costs nothing and writes nothing. Choosing is the write: the server downloads
// the file, stores it and keeps the photographer's name, and hands back the URL the page
// will use.

export interface PickedImage {
    /** The `assets` row — the provenance record for this picture. */
    assetId: string;
    /** What the page will point at. A static site cannot resolve an id at serve time. */
    url: string;
    alt: string;
    attribution: AssetAttribution;
}

export interface ImagePickerProps {
    open: boolean;
    projectId: string | null;
    kind?: 'image' | 'favicon' | 'og_image';
    title?: string;
    onClose: () => void;
    onPicked: (picked: PickedImage) => void;
}

type Phase = 'idle' | 'searching' | 'ready' | 'empty' | 'error';

export default function ImagePicker({ open, ...rest }: ImagePickerProps) {
    // The body is mounted only while the dialog is open, so reopening it starts on an empty
    // search rather than on last week's results. A fresh mount is the reset.
    return (
        <Dialog open={open} onOpenChange={(next) => !next && rest.onClose()}>
            {open && <PickerBody {...rest} />}
        </Dialog>
    );
}

function PickerBody({
    projectId,
    kind = 'image',
    title = 'Choose a photo',
    onClose,
    onPicked,
}: Omit<ImagePickerProps, 'open'>) {
    const [query, setQuery] = useState('');
    const [phase, setPhase] = useState<Phase>('idle');
    const [results, setResults] = useState<ImageSearchResult[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const runSearch = useCallback(async () => {
        const term = query.trim();
        if (!term) return;

        setPhase('searching');
        setMessage(null);

        const { results: found, error } = await searchImages(term);

        if (error || !found) {
            setPhase('error');
            setMessage(error);
            return;
        }

        setResults(found.items);
        setPhase(found.items.length === 0 ? 'empty' : 'ready');
    }, [query]);

    async function choose(result: ImageSearchResult) {
        if (!projectId || busyId) return;

        setBusyId(result.id);
        setMessage(null);

        const { asset, error } = await pickUnsplashImage(projectId, result.id, kind);
        setBusyId(null);

        if (error || !asset) {
            setMessage(error ?? 'That photo could not be added.');
            return;
        }

        onPicked({
            assetId: asset.id,
            // The stored copy is what the page points at; the search thumbnail was only ever
            // for looking at.
            url: asset.url ?? result.fullUrl,
            alt: result.description,
            attribution: asset.attribution ?? result.attribution,
        });
        onClose();
    }

    async function upload(file: File) {
        if (!projectId) return;

        setBusyId('upload');
        setMessage(null);

        const { asset, error } = await uploadProjectImage(projectId, file, kind);
        setBusyId(null);

        if (error || !asset || !asset.url) {
            setMessage(error ?? 'That image could not be uploaded.');
            return;
        }

        onPicked({
            assetId: asset.id,
            url: asset.url,
            alt: file.name.replace(/\.[^.]+$/, ''),
            attribution: {},
        });
        onClose();
    }

    return (
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>
                    Search millions of free photos, or upload your own.
                </DialogDescription>
            </DialogHeader>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    void runSearch();
                }}
                className="flex items-center gap-2"
            >
                <div className="relative flex-1">
                    <Search
                        aria-hidden
                        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                        autoFocus
                        value={query}
                        maxLength={80}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="coffee shop, mountains, office…"
                        aria-label="Search photos"
                        className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                </div>
                <button
                    type="submit"
                    disabled={!query.trim() || phase === 'searching'}
                    className="cursor-pointer rounded-md border border-gold bg-gold px-3 py-1.5 text-sm text-gold-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Search
                </button>
                <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={busyId === 'upload'}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
                >
                    <Upload aria-hidden className="size-4" />
                    Upload
                </button>
                <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void upload(file);
                    }}
                />
            </form>

            <div className="min-h-64 max-h-96 overflow-auto">
                {phase === 'searching' && (
                    <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                        Looking for photos…
                    </p>
                )}

                {phase === 'idle' && !message && (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                        Type what your page is about and press Search.
                    </p>
                )}

                {phase === 'empty' && (
                    <p className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
                        <ImageOff aria-hidden className="size-5" />
                        No photos matched “{query.trim()}”. Try a simpler word.
                    </p>
                )}

                {phase === 'ready' && (
                    <ul className="grid grid-cols-3 gap-2">
                        {results.map((result) => (
                            <li key={result.id}>
                                <button
                                    type="button"
                                    onClick={() => void choose(result)}
                                    disabled={busyId !== null}
                                    className="group relative block w-full overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={result.thumbUrl}
                                        alt={result.description || 'Photo'}
                                        loading="lazy"
                                        className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105"
                                    />
                                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-left text-[11px] text-white">
                                        {result.attribution.name ?? 'Unsplash'}
                                    </span>
                                    {busyId === result.id && (
                                        <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                                            <Loader2 aria-hidden className="size-4 animate-spin" />
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

        {message && (
            <p role="alert" className="text-sm text-destructive">
                {message}
            </p>
        )}
        </DialogContent>
    );
}
