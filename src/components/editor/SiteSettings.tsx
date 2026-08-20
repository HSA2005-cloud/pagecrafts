'use client';
import { useMemo, useState } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';

import { useEditorStore } from '@/lib/editor-store';
import { hasContactForm } from '@/lib/content/site-meta';
import ImagePicker, { type PickedImage } from './ImagePicker';
import FieldShell, { controlClass, invalidClass, lengthHint } from './fields/FieldShell';
import ImageField from './fields/ImageField';

// Site-wide settings, at the foot of the content panel: the things that belong to the whole
// page rather than to a band of it (S-2, S-3, S-4).
//
// These are project columns, not content slots, so they go to PATCH /projects rather than
// PATCH /content — and they are saved on a button rather than as you type, because a
// half-typed web address is not a state anyone wants written down.

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

interface Asset {
    id: string;
    url: string;
}

const NO_ASSET: Asset = { id: '', url: '' };

function endpointIssue(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (!/^https:\/\//i.test(trimmed)) {
        return 'The address must start with https:// — that is what keeps what people send you private.';
    }
    try {
        new URL(trimmed);
    } catch {
        return 'That does not look like a web address.';
    }
    return null;
}

export default function SiteSettings() {
    const siteMeta = useEditorStore((s) => s.siteMeta);
    const formEndpoint = useEditorStore((s) => s.formEndpoint);
    const saving = useEditorStore((s) => s.settingsSaving);
    const error = useEditorStore((s) => s.settingsError);
    const saveSettings = useEditorStore((s) => s.saveSettings);
    const projectId = useEditorStore((s) => s.projectId);
    const vfs = useEditorStore((s) => s.vfs);
    const tree = useEditorStore((s) => s.tree);

    const [title, setTitle] = useState(siteMeta.title ?? '');
    const [description, setDescription] = useState(siteMeta.description ?? '');
    // Each image keeps both halves: the asset id is the record of where it came from, the
    // URL is what the page will point at.
    const [favicon, setFavicon] = useState<Asset>({
        id: siteMeta.faviconAssetId ?? '',
        url: siteMeta.faviconUrl ?? '',
    });
    const [ogImage, setOgImage] = useState<Asset>({
        id: siteMeta.ogImageAssetId ?? '',
        url: siteMeta.ogImageUrl ?? '',
    });
    const [endpoint, setEndpoint] = useState(formEndpoint ?? '');
    const [picking, setPicking] = useState<'favicon' | 'og_image' | null>(null);
    const [saved, setSaved] = useState(false);

    // The server is the authority: a reload, or a save that came back changed, resets the
    // boxes to what was actually stored. Adjusted during render rather than in an effect —
    // the boxes must never paint a stale value first and correct itself afterwards.
    const [syncedFrom, setSyncedFrom] = useState({ meta: siteMeta, endpoint: formEndpoint });

    if (syncedFrom.meta !== siteMeta || syncedFrom.endpoint !== formEndpoint) {
        setSyncedFrom({ meta: siteMeta, endpoint: formEndpoint });
        setTitle(siteMeta.title ?? '');
        setDescription(siteMeta.description ?? '');
        setFavicon({ id: siteMeta.faviconAssetId ?? '', url: siteMeta.faviconUrl ?? '' });
        setOgImage({ id: siteMeta.ogImageAssetId ?? '', url: siteMeta.ogImageUrl ?? '' });
        setEndpoint(formEndpoint ?? '');
    }

    const issue = endpointIssue(endpoint);

    // Whether this design has a contact form at all decides what the endpoint field says
    // about itself. The VFS mutates in place, so the file contents cannot be a dependency —
    // `tree` is the store's signal that they moved, which is why it is read here.
    const pageHasForm = useMemo(() => {
        void tree;
        const entry = vfs.paths().find((p) => /\.html?$/i.test(p));
        return entry ? hasContactForm(vfs.read(entry) ?? '') : false;
    }, [vfs, tree]);

    const dirty =
        title !== (siteMeta.title ?? '') ||
        description !== (siteMeta.description ?? '') ||
        favicon.url !== (siteMeta.faviconUrl ?? '') ||
        ogImage.url !== (siteMeta.ogImageUrl ?? '') ||
        endpoint !== (formEndpoint ?? '');

    async function save() {
        if (issue) return;

        setSaved(false);
        await saveSettings({
            siteMeta: {
                ...(title.trim() ? { title: title.trim() } : {}),
                ...(description.trim() ? { description: description.trim() } : {}),
                ...(favicon.id ? { faviconAssetId: favicon.id } : {}),
                ...(favicon.url ? { faviconUrl: favicon.url } : {}),
                ...(ogImage.id ? { ogImageAssetId: ogImage.id } : {}),
                ...(ogImage.url ? { ogImageUrl: ogImage.url } : {}),
            },
            formEndpoint: endpoint.trim() || null,
        });
        setSaved(true);
    }

    function onPicked(picked: PickedImage) {
        const chosen: Asset = { id: picked.assetId, url: picked.url };
        if (picking === 'favicon') setFavicon(chosen);
        if (picking === 'og_image') setOgImage(chosen);
    }

    return (
        <section className="space-y-3.5 border-t border-border pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Site settings
            </h3>

            <FieldShell
                id="site-title"
                label="Page title"
                hint={`Shown in the browser tab and in search results · ${lengthHint(title, TITLE_MAX)}`}
            >
                <input
                    id="site-title"
                    type="text"
                    value={title}
                    maxLength={TITLE_MAX}
                    onChange={(e) => setTitle(e.target.value)}
                    className={controlClass}
                />
            </FieldShell>

            <FieldShell
                id="site-description"
                label="Description"
                hint={`The sentence under your name in search results · ${lengthHint(description, DESCRIPTION_MAX)}`}
            >
                <textarea
                    id="site-description"
                    rows={2}
                    value={description}
                    maxLength={DESCRIPTION_MAX}
                    onChange={(e) => setDescription(e.target.value)}
                    className={`${controlClass} resize-y`}
                />
            </FieldShell>

            <ImageField
                id="site-favicon"
                label="Tab icon"
                value={favicon.url || null}
                onOpenLibrary={() => setPicking('favicon')}
                onClear={() => setFavicon(NO_ASSET)}
            />

            <ImageField
                id="site-og-image"
                label="Sharing image"
                value={ogImage.url || null}
                onOpenLibrary={() => setPicking('og_image')}
                onClear={() => setOgImage(NO_ASSET)}
            />

            <FieldShell
                id="site-form-endpoint"
                label="Contact form address"
                issue={issue}
                hint={
                    pageHasForm
                        ? 'Where your contact form sends what people write. Leave it empty and the form stays switched off.'
                        : 'This design has no contact form, so this will not change anything yet.'
                }
            >
                <input
                    id="site-form-endpoint"
                    type="url"
                    inputMode="url"
                    value={endpoint}
                    placeholder="https://formspree.io/f/xyz"
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={issue ? 'site-form-endpoint-error' : undefined}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className={`${controlClass} ${issue ? invalidClass : ''}`}
                />
            </FieldShell>

            {error && (
                <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
                    <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
                    {error}
                </p>
            )}

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || !dirty || issue !== null}
                    className="cursor-pointer rounded-md border border-gold bg-gold px-3 py-1.5 text-sm text-gold-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {saving ? 'Saving…' : 'Save settings'}
                </button>

                {saving && <Loader2 aria-hidden className="size-3.5 animate-spin text-muted-foreground" />}

                {saved && !dirty && !error && !saving && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Check aria-hidden className="size-3" />
                        Saved
                    </span>
                )}
            </div>

            <ImagePicker
                open={picking !== null}
                projectId={projectId}
                kind={picking ?? 'image'}
                title={picking === 'favicon' ? 'Choose a tab icon' : 'Choose a sharing image'}
                onClose={() => setPicking(null)}
                onPicked={onPicked}
            />
        </section>
    );
}
