'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { EDIT_UNLOCK_PRICE_INR } from '@/lib/payments/pricing';
import {
    pollDeployment,
    saveProjectSettings,
    startProjectPublish,
} from '@/lib/project-source';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'naming' | 'confirm' | 'publishing' | 'success' | 'error';

const SITES_HREF = '/?slide=sites';

export default function GoLiveButton({
    projectId,
    projectName,
    className,
}: {
    projectId: string;
    projectName: string | null;
    className?: string;
}) {
    const router = useRouter();
    const saveProject = useEditorStore((s) => s.saveProject);
    const flushPendingSave = useEditorStore((s) => s.flushPendingSave);
    const setProjectName = useEditorStore((s) => s.setProjectName);

    const [phase, setPhase] = useState<Phase>('idle');
    const [siteName, setSiteName] = useState('');
    const [liveUrl, setLiveUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const cancelledRef = useRef(false);

    function openNaming() {
        setSiteName(projectName?.trim() || 'My site');
        setError(null);
        setPhase('naming');
    }

    function closeAll() {
        cancelledRef.current = true;
        setPhase('idle');
        setError(null);
        setLiveUrl(null);
    }

    function goToYourSites() {
        closeAll();
        router.push(SITES_HREF);
    }

    function openLiveAndLeave() {
        if (liveUrl) {
            window.open(liveUrl, '_blank', 'noopener,noreferrer');
        }
        goToYourSites();
    }

    function continueToConfirm(e?: FormEvent) {
        e?.preventDefault();
        const name = siteName.trim();
        if (!name) {
            setError('Give your site a name.');
            return;
        }
        setError(null);
        setPhase('confirm');
    }

    async function publishSite() {
        const name = siteName.trim();
        if (!name) {
            setError('Give your site a name.');
            setPhase('naming');
            return;
        }

        cancelledRef.current = false;
        setPhase('publishing');
        setError(null);

        flushPendingSave();
        await saveProject();
        if (cancelledRef.current) return;

        const { detail, error: nameError } = await saveProjectSettings(projectId, { name });
        if (cancelledRef.current) return;
        if (nameError) {
            setPhase('error');
            setError(
                /taken|already|exists/i.test(nameError)
                    ? 'That name is already taken. Choose another name.'
                    : nameError,
            );
            return;
        }
        if (detail?.name) setProjectName(detail.name);

        const idempotencyKey =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random()}`;

        const { deploymentId, status, liveUrl, error: publishError } =
            await startProjectPublish(projectId, idempotencyKey);
        if (cancelledRef.current) return;
        if (publishError && !deploymentId) {
            setPhase('error');
            setError(
                /taken|reserved/i.test(publishError)
                    ? publishError
                    : publishError,
            );
            return;
        }

        if (status === 'live' && liveUrl) {
            setLiveUrl(liveUrl);
            setPhase('success');
            return;
        }

        if (status === 'failed') {
            setPhase('error');
            setError(publishError ?? 'Publishing did not finish. Try again in a moment.');
            return;
        }

        if (!deploymentId) {
            setPhase('error');
            setError(publishError ?? 'Publishing could not start.');
            return;
        }

        // Fallback poll only if the server still answered pending (rare).
        for (let attempt = 0; attempt < 30; attempt++) {
            if (cancelledRef.current) return;
            if (attempt > 0) {
                await new Promise((resolve) => setTimeout(resolve, 400));
            }
            if (cancelledRef.current) return;
            const { deployment, error: pollError } = await pollDeployment(deploymentId);
            if (cancelledRef.current) return;
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

        if (cancelledRef.current) return;
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
                            Choose a unique name for your site. Your address will look like
                            the preview below. If that name is taken, you will need to pick
                            another.
                        </DialogDescription>
                    </DialogHeader>
                    <p
                        role="note"
                        className="rounded-xl border border-border bg-muted px-3 py-2.5 text-sm leading-6 text-muted-foreground"
                    >
                        <span className="font-medium text-muted-foreground">One chance:</span>{' '}
                        after this site goes live you cannot edit it for free. Check the
                        preview carefully before you continue.
                    </p>
                    <form onSubmit={continueToConfirm} className="grid gap-3">
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
                                Continue
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={phase === 'confirm'}
                onOpenChange={(open) => {
                    if (!open) closeAll();
                }}
            >
                <DialogContent className="border-border/70 bg-card/90 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle>Publish once — then edits are locked</DialogTitle>
                        <DialogDescription className="text-sm leading-6 text-muted-foreground">
                            You are about to publish{' '}
                            <span className="font-medium text-foreground">{preview}</span>.
                            This is your one free Go Live. After the site is live, you cannot
                            change it unless you unlock editing later for{' '}
                            <span className="font-medium text-foreground">
                                Rs {EDIT_UNLOCK_PRICE_INR}
                            </span>
                            .
                        </DialogDescription>
                    </DialogHeader>
                    <p
                        role="alert"
                        className="rounded-xl border border-border bg-muted px-3 py-2.5 text-sm leading-6 text-muted-foreground"
                    >
                        Warning: once this website is live, you cannot make changes to it on
                        the free plan. Make sure everything looks right before you confirm.
                    </p>
                    <DialogFooter className="pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 cursor-pointer"
                            onClick={() => setPhase('naming')}
                        >
                            Back
                        </Button>
                        <Button
                            type="button"
                            variant="brand"
                            className="min-h-11 cursor-pointer"
                            onClick={() => void publishSite()}
                        >
                            I understand — publish
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={phase === 'publishing'}
                onOpenChange={(open) => {
                    if (!open) closeAll();
                }}
            >
                <DialogContent className="border-border/70 bg-card/90 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle>Publishing your site</DialogTitle>
                        <DialogDescription className="text-sm leading-6 text-muted-foreground">
                            Setting up hosting and pushing your latest changes. This should
                            finish within about a minute.
                        </DialogDescription>
                    </DialogHeader>
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                        Working on {previewSiteUrl(siteName)}…
                    </p>
                    <DialogFooter className="pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 cursor-pointer"
                            onClick={closeAll}
                        >
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={phase === 'success'}
                onOpenChange={(open) => {
                    if (!open) goToYourSites();
                }}
            >
                <DialogContent className="border-border/70 bg-card/90 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle>Your site is live</DialogTitle>
                        <DialogDescription className="text-sm leading-6 text-muted-foreground">
                            {siteName.trim()} is on PageCrafts. Opening the link takes you to
                            your site; closing this returns you to Your sites. This live site
                            cannot be edited for free — further changes need Rs{' '}
                            {EDIT_UNLOCK_PRICE_INR}.
                        </DialogDescription>
                    </DialogHeader>
                    {liveUrl ? (
                        <button
                            type="button"
                            onClick={openLiveAndLeave}
                            className={cn(
                                'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-gold bg-gold px-4',
                                'text-sm font-semibold text-gold-foreground hover:opacity-90',
                            )}
                        >
                            Open {liveUrl.replace(/^https:\/\//, '')}
                            <ExternalLink aria-hidden className="size-4" />
                        </button>
                    ) : null}
                    <DialogFooter className="pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 cursor-pointer"
                            onClick={goToYourSites}
                        >
                            Close
                        </Button>
                        <Button
                            type="button"
                            variant="brand"
                            className="min-h-11 cursor-pointer"
                            onClick={goToYourSites}
                        >
                            Your sites
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
