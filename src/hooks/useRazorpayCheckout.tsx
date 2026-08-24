'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { apiPost } from '@/lib/api/client';
import {
    RazorpayConfirmDialog,
    type RazorpayConfirmKind,
} from '@/components/payments/RazorpayConfirmDialog';

// ── Razorpay window types ────────────────────────────────────────────────────
// The checkout.js script adds `Razorpay` to the global scope. These are the
// types needed to open and close a modal — nothing else is used.

interface RazorpaySuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
}

interface RazorpayOptions {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;
    handler: (response: RazorpaySuccessResponse) => void;
    modal?: { ondismiss?: () => void };
    prefill?: { name?: string; email?: string };
    theme?: { color?: string };
}

interface RazorpayInstance {
    open: () => void;
}

declare global {
    interface Window {
        Razorpay?: new (opts: RazorpayOptions) => RazorpayInstance;
    }
}

// ── Script loader ────────────────────────────────────────────────────────────
// Loads checkout.js at most once per page lifetime. Re-entrant: many components
// can call loadScript() and they share the same promise.

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise: Promise<void> | null = null;

function paintRazorpayBackdrop(on: boolean) {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('pagecrafts-rzp-open', on);
}

function loadScript(): Promise<void> {
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise<void>((resolve, reject) => {
        // Already present (e.g. added in layout)
        if (window.Razorpay) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = SCRIPT_SRC;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            scriptPromise = null; // allow retry
            reject(new Error('Failed to load Razorpay checkout script'));
        };
        document.head.appendChild(script);
    });

    return scriptPromise;
}

// ── Checkout response (mirrors server's CheckoutResponse) ────────────────────

interface CheckoutData {
    granted: boolean;
    orderId?: string;
    amountInPaise?: number;
    currency?: 'INR';
    keyId?: string;
    priceInr?: number;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type CheckoutStatus = 'idle' | 'loading' | 'open' | 'verifying' | 'success' | 'error';

interface UseRazorpayCheckoutOptions {
    /** App name shown in the Razorpay modal. */
    appName?: string;
    /** Primary brand colour for the Razorpay modal. */
    themeColor?: string;
    /** Called when the design is already paid for (no modal needed). */
    onAlreadyGranted?: () => void;
    /** Called after the payment is verified and granted server-side. */
    onSuccess?: (result?: { kind?: string; granted?: boolean }) => void;
    /** Called when the user closes the modal without paying (or cancels confirm). */
    onDismiss?: () => void;
    /** Called on any failure (script load, order creation, verification). */
    onError?: (message: string) => void;
    /** Prefill fields for the Razorpay modal. */
    prefill?: { name?: string; email?: string };
}

interface UseRazorpayCheckoutReturn {
    /** Start the checkout flow for publishing a project. */
    openCheckout: (projectId: string) => Promise<void>;
    /** Buy one catalogue design (routes to plan upgrade). */
    openTemplateCheckout: (templateId: string) => Promise<void>;
    /** Buy one generated look (routes to plan upgrade). */
    openStyleCheckout: (styleId: string) => Promise<void>;
    /** Upgrade account to Pro or Premium — unlocks the whole design tier. */
    openPlanCheckout: (plan: 'pro' | 'premium') => Promise<void>;
    /** Buy the Advanced AI usage package. */
    openAdvancedCheckout: () => Promise<void>;
    /** Buy one extra AI generation round. */
    openGenerationPassCheckout: () => Promise<void>;
    /** Current status of the checkout flow. */
    status: CheckoutStatus;
    /** Human-readable error, set when status is 'error'. */
    error: string | null;
    /** Must be rendered by the caller so the Agree/Cancel dialog can mount. */
    confirmDialog: ReactNode;
}

type PendingConfirm = {
    kind: RazorpayConfirmKind;
    run: () => Promise<void>;
    resolve: () => void;
};

export function useRazorpayCheckout(
    opts: UseRazorpayCheckoutOptions = {},
): UseRazorpayCheckoutReturn {
    const {
        appName = 'PageCrafts',
        themeColor = '#dc2626',
        onAlreadyGranted,
        onSuccess,
        onDismiss,
        onError,
        prefill,
    } = opts;

    const [status, setStatus] = useState<CheckoutStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

    // Guard against double-clicks while a checkout is in progress.
    const busyRef = useRef(false);

    const startOrder = useCallback(
        async (
            path: string,
            descriptionFor: (data: CheckoutData) => string,
            payload: Record<string, unknown> = {},
        ) => {
            if (busyRef.current) return;
            busyRef.current = true;
            setStatus('loading');
            setError(null);

            try {
                await loadScript();

                const { data, error: apiError } = await apiPost<CheckoutData>(path, payload);

                if (apiError || !data) {
                    throw new Error(apiError ?? 'Could not start checkout.');
                }

                if (data.granted) {
                    setStatus('success');
                    onAlreadyGranted?.();
                    return;
                }

                if (!data.orderId || !data.keyId || !data.amountInPaise) {
                    throw new Error('The server did not return a complete order.');
                }

                if (!window.Razorpay) {
                    throw new Error('Razorpay checkout script is not available.');
                }

                setStatus('open');
                paintRazorpayBackdrop(true);

                const rzp = new window.Razorpay({
                    key: data.keyId,
                    amount: data.amountInPaise,
                    currency: data.currency ?? 'INR',
                    name: appName,
                    description: descriptionFor(data),
                    order_id: data.orderId,
                    handler: async (response: RazorpaySuccessResponse) => {
                        paintRazorpayBackdrop(false);
                        setStatus('verifying');

                        const { data: verified, error: verifyError } = await apiPost<{
                            verified: boolean;
                            granted?: boolean;
                            kind?: string;
                        }>('/api/v1/payments/razorpay/verify', {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                        });

                        if (verifyError) {
                            setStatus('error');
                            setError(verifyError);
                            onError?.(verifyError);
                            return;
                        }

                        setStatus('success');
                        onSuccess?.({
                            kind: verified?.kind,
                            granted: verified?.granted ?? true,
                        });
                    },
                    modal: {
                        ondismiss: () => {
                            paintRazorpayBackdrop(false);
                            setStatus('idle');
                            setError(null);
                            onDismiss?.();
                        },
                    },
                    prefill: prefill ?? {},
                    theme: { color: themeColor },
                });

                rzp.open();
            } catch (err) {
                paintRazorpayBackdrop(false);
                const message =
                    err instanceof Error
                        ? err.message
                        : "We couldn't start the payment. Please try again.";
                console.error('[payments] checkout failed', message);
                setStatus('error');
                setError(message);
                onError?.(message);
            } finally {
                busyRef.current = false;
            }
        },
        [appName, themeColor, onAlreadyGranted, onSuccess, onDismiss, onError, prefill],
    );

    const withConfirm = useCallback(
        (kind: RazorpayConfirmKind, run: () => Promise<void>) =>
            new Promise<void>((resolve) => {
                setPendingConfirm({
                    kind,
                    run,
                    resolve,
                });
            }),
        [],
    );

    const cancelConfirm = useCallback(() => {
        setPendingConfirm((current) => {
            if (current) {
                current.resolve();
                onDismiss?.();
            }
            return null;
        });
    }, [onDismiss]);

    const agreeConfirm = useCallback(() => {
        setPendingConfirm((current) => {
            if (!current) return null;
            const { run, resolve } = current;
            void (async () => {
                try {
                    await run();
                } finally {
                    resolve();
                }
            })();
            return null;
        });
    }, []);

    const openCheckout = useCallback(
        (projectId: string) =>
            withConfirm('publish', () =>
                startOrder(
                    `/api/v1/projects/${encodeURIComponent(projectId)}/checkout`,
                    (data) => `Publish · Rs ${data.priceInr ?? data.amountInPaise! / 100}`,
                ),
            ),
        [startOrder, withConfirm],
    );

    const openTemplateCheckout = useCallback(
        (templateId: string) =>
            withConfirm('plan', () =>
                startOrder(
                    `/api/v1/templates/${encodeURIComponent(templateId)}/checkout`,
                    (data) => `Plan upgrade · Rs ${data.priceInr ?? data.amountInPaise! / 100}`,
                ),
            ),
        [startOrder, withConfirm],
    );

    const openStyleCheckout = useCallback(
        (styleId: string) =>
            withConfirm('plan', () =>
                startOrder(
                    `/api/v1/styles/${encodeURIComponent(styleId)}/checkout`,
                    (data) => `Plan upgrade · Rs ${data.priceInr ?? data.amountInPaise! / 100}`,
                ),
            ),
        [startOrder, withConfirm],
    );

    const openPlanCheckout = useCallback(
        (plan: 'pro' | 'premium') =>
            withConfirm('plan', () =>
                startOrder(
                    '/api/v1/account/billing/checkout',
                    (data) =>
                        `${plan === 'premium' ? 'Premium' : 'Pro'} · Rs ${data.priceInr ?? data.amountInPaise! / 100}`,
                    { plan },
                ),
            ),
        [startOrder, withConfirm],
    );

    const openAdvancedCheckout = useCallback(
        () =>
            withConfirm('advanced', () =>
                startOrder(
                    '/api/v1/account/packages/advanced/checkout',
                    (data) => `Advanced AI · Rs ${data.priceInr ?? data.amountInPaise! / 100}`,
                ),
            ),
        [startOrder, withConfirm],
    );

    const openGenerationPassCheckout = useCallback(
        () =>
            withConfirm('generation_pass', () =>
                startOrder(
                    '/api/v1/account/packages/generation/checkout',
                    (data) => `Extra generation · Rs ${data.priceInr ?? data.amountInPaise! / 100}`,
                ),
            ),
        [startOrder, withConfirm],
    );

    const confirmDialog = (
        <RazorpayConfirmDialog
            open={Boolean(pendingConfirm)}
            kind={pendingConfirm?.kind ?? 'design'}
            onCancel={cancelConfirm}
            onAgree={agreeConfirm}
        />
    );

    return {
        openCheckout,
        openTemplateCheckout,
        openStyleCheckout,
        openPlanCheckout,
        openAdvancedCheckout,
        openGenerationPassCheckout,
        status,
        error,
        confirmDialog,
    };
}
