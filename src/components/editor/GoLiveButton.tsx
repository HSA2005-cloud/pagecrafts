'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Check, ExternalLink, Loader2, Rocket } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '@/lib/editor-store';
import { previewSiteUrl } from '@/lib/publish/site-address';
import {
    pollDeployment,
    saveProjectSettings,
    startProjectPublish,
} from '@/lib/project-source';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'naming' | 'publishing' | 'success' | 'error';

export default function GoLiveButton({
    projectId,
    projectName,
    className,
}: {
    projectId: string;
    projectName: string | null;
    className?: string;
}) {
    const saveProject = useEditorStore((s) => s.saveProject);
    const flushPendingSave = useEditorStore((s) => s.flushPendingSave);
    const setProjectName = useEditorStore((s) => s.setProjectName);

    const [phase, setPhase] = useState<Phase>('idle');
    const [siteName, setSiteName] = useState('');
    const [liveUrl, setLiveUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (phase !== 'naming') return;
        setSiteName(projectName?.trim() || 'My site');
        setError(null);
    }, [phase, projectName]);

    function openNaming() {
        setPhase('naming');
    }

    function closeAll() {
        setPhase('idle');
        setError(null);
        setLiveUrl(null);
    }

    async function publishSite(e?: FormEvent) {
        e?.preventDefault();
        const name = siteName.trim();
        if (!name) {
            setError('Give your site a name.');
            return;
        }

        setPhase('publishing');
        setError(null);

        flushPendingSave();
        await saveProject();

        const { detail, error: nameError } = await saveProjectSettings(projectId, { name });
        if (nameError) {
            setPhase('error');
            setError(nameError);
            return;
        }
        if (detail?.name) setProjectName(detail.name);

        const idempotencyKey =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random()}`;

        const { deploymentId, error: publishError } = await startProjectPublish(
            projectId,
            idempotencyKey,
        );
        if (publishError || !deploymentId) {
            setPhase('error');
            setError(publishError ?? 'Publishing could not start.');
            return;
        }

        for (let attempt = 0; attempt < 60; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const { deployment, error: pollError } = await pollDeployment(deploymentId);
            if (pollError) {
                setPhase('error');
                setError(pollError);
                return;
            }
            if (!deployment) continue;

            if (deployment.status === 'live' && deployment.liveUrl) {
                setLiveUrl(deployment.liveUrl);
                setPhase('success');
                return;
            }

            if (deployment.status === 'failed') {
                setPhase('error');
                setError(
                    deployment.error ??
                        'Publishing did not finish. Try again in a moment.',
                );
                return;
            }
        }

        setPhase('error');
        setError('Publishing is taking longer than expected. Check Your sites in a minute.');
    }

    const busy = phase === 'publishing';
    const preview = previewSiteUrl(siteName || projectName || 'My site');

    return (
        <>
            <button
                id="go-live-button"
                type="button"
                disabled={busy || phase === 'success'}
                onClick={openNaming}
                className={
                    className ??
                    'inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40'
                }
            >
                {busy ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : phase === 'success' ? (
                    <Check aria-hidden className="size-4" />
                ) : (
                    <Rocket aria-hidden className="size-4" />
                )}
                {busy ? 'Publishing…' : phase === 'success' ? 'Live' : 'Go Live'}
            </button>

            <Dialog
                open={phase === 'naming'}
                onOpenChange={(open) => {
                    if (!open) closeAll();
                }}
            >
                <DialogContent className="border-border/70 bg-card/90 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle>Go live on PageCrafts</DialogTitle>
                        <DialogDescription className="text-sm leading-6 text-muted-foreground">
                            Choose a name for your site. We publish it to a PageCrafts address
                            — no payment needed. Custom domains are a separate upgrade later.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={publishSite} className="grid gap-3">
                        <label htmlFor="go-live-site-name" className="text-sm font-medium">
                            Site name
                        </label>
                        <Input
                            id="go-live-site-name"
                            inputSize="lg"
                            value={siteName}
                            autoFocus
                            placeholder="Kettle & Co."
                            onChange={(e) => {
                                setSiteName(e.target.value);
                                setError(null);
                            }}
                        />
                        <p className="text-xs text-muted-foreground">
                            Your address will look like{' '}
                            <span className="font-medium text-foreground">{preview}</span>
                            . If that name is taken, we add a number.
                        </p>
                        {error ? (
                            <p role="alert" className="text-sm text-destructive">
                                {error}
                            </p>
                        ) : null}
                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="min-h-11 cursor-pointer"
                                onClick={closeAll}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="brand"
                                className="min-h-11 cursor-pointer"
                            >
                                Publish
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={phase === 'publishing'}
                onOpenChange={() => {
                    /* keep open while publishing */
                }}
            >
                <DialogContent className="border-border/70 bg-card/90 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle>Publishing your site</DialogTitle>
                        <DialogDescription className="text-sm leading-6 text-muted-foreground">
                            Setting up hosting and pushing your latest changes. This usually
                            takes under a minute.
                        </DialogDescription>
                    </DialogHeader>
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                        Working on {previewSiteUrl(siteName)}…
                    </p>
                </DialogContent>
            </Dialog>

            <Dialog
                open={phase === 'success'}
                onOpenChange={(open) => {
                    if (!open) closeAll();
                }}
            >
                <DialogContent className="border-border/70 bg-card/90 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle>Your site is live</DialogTitle>
                        <DialogDescription className="text-sm leading-6 text-muted-foreground">
                            {siteName.trim()} is published on PageCrafts. Share the link below
                            — custom domain setup will ask for payment when it is ready.
                        </DialogDescription>
                    </DialogHeader>
                    {liveUrl ? (
                        <a
                            href={liveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                'inline-flex min-h-11 items-center gap-2 rounded-full border border-gold bg-gold px-4',
                                'text-sm font-semibold text-gold-foreground hover:opacity-90',
                            )}
                        >
                            Open {liveUrl.replace(/^https:\/\//, '')}
                            <ExternalLink aria-hidden className="size-4" />
                        </a>
                    ) : null}
                    <DialogFooter className="pt-2">
                        <Button
                            type="button"
                            variant="brand"
                            className="min-h-11 cursor-pointer"
                            onClick={closeAll}
                        >
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={phase === 'error'}
                onOpenChange={(open) => {
                    if (!open) closeAll();
                }}
            >
                <DialogContent className="border-border/70 bg-card/90 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle>Publishing did not finish</DialogTitle>
                    </DialogHeader>
                    {error ? (
                        <p
                            role="alert"
                            className="flex items-start gap-2 text-sm text-destructive"
                        >
                            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                            {error}
                        </p>
                    ) : null}
                    <DialogFooter className="pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 cursor-pointer"
                            onClick={closeAll}
                        >
                            Close
                        </Button>
                        <Button
                            type="button"
                            variant="brand"
                            className="min-h-11 cursor-pointer"
                            onClick={() => setPhase('naming')}
                        >
                            Try again
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
