'use client';

import { useCallback, useRef, useState } from 'react';
import { apiPost } from '@/lib/api/client';

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
    /** Called after the payment is verified server-side. */
    onSuccess?: () => void;
    /** Called when the user closes the modal without paying. */
    onDismiss?: () => void;
    /** Called on any failure (script load, order creation, verification). */
    onError?: (message: string) => void;
    /** Prefill fields for the Razorpay modal. */
    prefill?: { name?: string; email?: string };
}

interface UseRazorpayCheckoutReturn {
    /** Start the checkout flow for a project. */
    openCheckout: (projectId: string) => Promise<void>;
    /** Current status of the checkout flow. */
    status: CheckoutStatus;
    /** Human-readable error, set when status is 'error'. */
    error: string | null;
}

export function useRazorpayCheckout(
    opts: UseRazorpayCheckoutOptions = {},
): UseRazorpayCheckoutReturn {
    const {
        appName = 'PageCrafts',
        themeColor = '#6366f1',
        onAlreadyGranted,
        onSuccess,
        onDismiss,
        onError,
        prefill,
    } = opts;

    const [status, setStatus] = useState<CheckoutStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    // Guard against double-clicks while a checkout is in progress.
    const busyRef = useRef(false);

    const openCheckout = useCallback(
        async (projectId: string) => {
            if (busyRef.current) return;
            busyRef.current = true;
            setStatus('loading');
            setError(null);

            try {
                // 1. Load the Razorpay script (no-op if already loaded).
                await loadScript();

                // 2. Call our backend to create an order (or discover it's free).
                const { data, error: apiError } = await apiPost<CheckoutData>(
                    `/api/v1/projects/${encodeURIComponent(projectId)}/checkout`,
                    {},
                );

                if (apiError || !data) {
                    throw new Error(apiError ?? 'Could not start checkout.');
                }

                // Free design — already granted, no modal.
                if (data.granted) {
                    setStatus('success');
                    onAlreadyGranted?.();
                    return;
                }

                if (!data.orderId || !data.keyId || !data.amountInPaise) {
                    throw new Error('The server did not return a complete order.');
                }

                // 3. Open the Razorpay modal.
                if (!window.Razorpay) {
                    throw new Error('Razorpay checkout script is not available.');
                }

                setStatus('open');

                const rzp = new window.Razorpay({
                    key: data.keyId,
                    amount: data.amountInPaise,
                    currency: data.currency ?? 'INR',
                    name: appName,
                    description: `Publish · Rs ${data.priceInr ?? data.amountInPaise / 100}`,
                    order_id: data.orderId,
                    handler: async (response: RazorpaySuccessResponse) => {
                        // 4. Verify the signature server-side.
                        setStatus('verifying');

                        const { error: verifyError } = await apiPost<{ verified: boolean }>(
                            '/api/v1/payments/razorpay/verify',
                            {
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                            },
                        );

                        if (verifyError) {
                            setStatus('error');
                            setError(verifyError);
                            onError?.(verifyError);
                            return;
                        }

                        setStatus('success');
                        onSuccess?.();
                    },
                    modal: {
                        ondismiss: () => {
                            setStatus('idle');
                            onDismiss?.();
                        },
                    },
                    prefill: prefill ?? {},
                    theme: { color: themeColor },
                });

                rzp.open();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Payment failed.';
                setStatus('error');
                setError(message);
                onError?.(message);
            } finally {
                busyRef.current = false;
            }
        },
        [appName, themeColor, onAlreadyGranted, onSuccess, onDismiss, onError, prefill],
    );

    return { openCheckout, status, error };
}
