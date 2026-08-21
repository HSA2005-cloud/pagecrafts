// The browser side of Razorpay Checkout (R-plans).
//
// The secret never comes near this file — only the public key id, handed back by
// /api/v1/plans/checkout with the order. This loads the hosted checkout script once and
// types the slice of its API we use. Everything a payment unlocks is decided by the server
// afterwards, in /api/v1/plans/verify; this only opens the widget and reports what the
// browser was told.

export interface RazorpayHandlerResponse {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}

export interface RazorpayOptions {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
    description?: string;
    handler: (response: RazorpayHandlerResponse) => void;
    prefill?: { email?: string; name?: string };
    theme?: { color?: string };
    modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
    open(): void;
    on(event: string, handler: (response: unknown) => void): void;
}

declare global {
    interface Window {
        Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
    }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loading: Promise<boolean> | null = null;

/** Inject the checkout script once and resolve to whether it is usable. */
export function loadRazorpay(): Promise<boolean> {
    if (typeof window === "undefined") return Promise.resolve(false);
    if (window.Razorpay) return Promise.resolve(true);
    if (loading) return loading;

    loading = new Promise<boolean>((resolve) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
        if (existing) {
            existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)));
            existing.addEventListener("error", () => resolve(false));
            // Already present and parsed in a previous attempt.
            if (window.Razorpay) resolve(true);
            return;
        }

        const script = document.createElement("script");
        script.src = CHECKOUT_SRC;
        script.async = true;
        script.onload = () => resolve(Boolean(window.Razorpay));
        script.onerror = () => {
            loading = null; // let a later attempt retry the network
            resolve(false);
        };
        document.body.appendChild(script);
    });

    return loading;
}

export function openCheckout(options: RazorpayOptions): boolean {
    if (typeof window === "undefined" || !window.Razorpay) return false;
    const instance = new window.Razorpay(options);
    instance.on("payment.failed", () => {
        // Surfaced by the ondismiss/handler path; the listener keeps the SDK from logging an
        // unhandled event. The real user-facing message is set by the caller.
    });
    instance.open();
    return true;
}
