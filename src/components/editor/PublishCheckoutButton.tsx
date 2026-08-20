'use client';

import { Loader2, Rocket, Check, AlertCircle } from 'lucide-react';
import { useRazorpayCheckout, type CheckoutStatus } from '@/hooks/useRazorpayCheckout';

// A self-contained publish button that drives the full Razorpay checkout flow.
//
// Drop it into TopBar, EditorShell, or any page that has a projectId. It handles
// every state: idle → loading → modal open → verifying → success / error, and
// resets gracefully on dismiss or failure.

interface PublishCheckoutButtonProps {
    projectId: string;
    /** Called after a successful payment or when the design was already free/paid. */
    onPublished?: () => void;
    /** Optional user details to prefill in the Razorpay modal. */
    prefill?: { name?: string; email?: string };
    className?: string;
}

const LABEL: Record<CheckoutStatus, string> = {
    idle: 'Go Live',
    loading: 'Preparing…',
    open: 'Complete payment…',
    verifying: 'Verifying…',
    success: 'Published!',
    error: 'Try again',
};

export default function PublishCheckoutButton({
    projectId,
    onPublished,
    prefill,
    className,
}: PublishCheckoutButtonProps) {
    const { openCheckout, status, error } = useRazorpayCheckout({
        prefill,
        onAlreadyGranted: () => onPublished?.(),
        onSuccess: () => onPublished?.(),
    });

    const busy = status === 'loading' || status === 'verifying';
    const succeeded = status === 'success';

    return (
        <div className="inline-flex flex-col items-end gap-1">
            <button
                id="publish-checkout-button"
                type="button"
                disabled={busy || succeeded}
                onClick={() => void openCheckout(projectId)}
                className={
                    className ??
                    'inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40'
                }
            >
                {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
                {succeeded && <Check aria-hidden className="size-4" />}
                {!busy && !succeeded && <Rocket aria-hidden className="size-4" />}
                {LABEL[status]}
            </button>

            {status === 'error' && error && (
                <span
                    role="alert"
                    className="flex max-w-xs items-start gap-1 text-xs text-destructive"
                >
                    <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
                    {error}
                </span>
            )}
        </div>
    );
}
