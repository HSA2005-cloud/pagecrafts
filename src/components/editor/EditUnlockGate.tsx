'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useRazorpayCheckout } from '@/hooks/useRazorpayCheckout';
import { apiGet } from '@/lib/api/client';
import { EDIT_UNLOCK_PRICE_INR } from '@/lib/payments/pricing';

type Access = {
    allowed: boolean;
    reason: string;
    unlockPriceInr: number;
};

/**
 * Blocks the editor after the free first publish until Rs 249 unlocks editing.
 */
export function EditUnlockGate({
    projectId,
    children,
}: {
    projectId: string;
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [access, setAccess] = useState<Access | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        const { data, error } = await apiGet<Access>(
            `/api/v1/projects/${encodeURIComponent(projectId)}/edit-access`,
        );
        if (error || !data) {
            setLoadError(error ?? 'Could not check edit access.');
            return;
        }
        setLoadError(null);
        setAccess(data);
    }, [projectId]);

    useEffect(() => {
        // Load access on mount / project change. setState lands after the fetch, not
        // during render — same pattern as other paywall gates.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch
        void refresh();
    }, [refresh]);

    const { openEditUnlockCheckout, status, confirmDialog } = useRazorpayCheckout({
        onAlreadyGranted: () => {
            void refresh();
        },
        onSuccess: () => {
            void refresh();
        },
    });

    if (!access && !loadError) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Checking edit access…
            </div>
        );
    }

    if (access?.allowed) {
        return <>{children}</>;
    }

    const price = access?.unlockPriceInr ?? EDIT_UNLOCK_PRICE_INR;
    const paying = status === 'loading' || status === 'open' || status === 'verifying';

    return (
        <>
            {confirmDialog}
            <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-full border border-border bg-secondary">
                    <Lock className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <h2 className="text-xl font-semibold text-foreground">This site is live</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                    Your first publish was free. To edit and republish to the same address,
                    unlock editing for <span className="font-medium text-foreground">Rs {price}</span>.
                </p>
                {loadError ? (
                    <p role="alert" className="text-sm text-destructive">
                        {loadError}
                    </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 cursor-pointer"
                        onClick={() => router.push('/?slide=sites')}
                    >
                        Your sites
                    </Button>
                    <Button
                        type="button"
                        variant="brand"
                        className="min-h-11 cursor-pointer"
                        disabled={paying}
                        onClick={() => void openEditUnlockCheckout(projectId)}
                    >
                        {paying ? (
                            <>
                                <Loader2 className="size-4 animate-spin" aria-hidden />
                                Opening payment…
                            </>
                        ) : (
                            <>Unlock editing · Rs {price}</>
                        )}
                    </Button>
                </div>
            </div>
        </>
    );
}
