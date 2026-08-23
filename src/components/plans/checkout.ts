import { apiPost } from "@/lib/api/client";
import type { PaidPlan } from "@/lib/contracts";

interface OrderResponse {
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
    plan: PaidPlan;
}

interface RazorpayCheckoutResult {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
}

interface RazorpayInstance {
    open: () => void;
    on: (event: string, handler: (payload: unknown) => void) => void;
}

interface RazorpayOptions {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    handler: (result: RazorpayCheckoutResult) => void;
    modal?: { ondismiss?: () => void };
    theme?: { color?: string };
}

declare global {
    interface Window {
        Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
    }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay(): Promise<boolean> {
    if (typeof window === "undefined") return Promise.resolve(false);
    if (window.Razorpay) return Promise.resolve(true);

    return new Promise((resolve) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
        if (existing) {
            existing.addEventListener("load", () => resolve(true));
            existing.addEventListener("error", () => resolve(false));
            return;
        }
        const script = document.createElement("script");
        script.src = CHECKOUT_SRC;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
}

export type UpgradeOutcome =
    | { status: "upgraded"; plan: PaidPlan }
    | { status: "cancelled" }
    | { status: "error"; message: string };

/**
 * Run the full Razorpay test-mode upgrade: create the order server-side, open Checkout, then
 * verify the signature server-side. The plan is only granted by the /verify call — the browser
 * "success" alone changes nothing.
 */
export async function startUpgrade(plan: PaidPlan): Promise<UpgradeOutcome> {
    const { data: order, error } = await apiPost<OrderResponse>("/api/v1/billing/order", { plan });
    if (error || !order) {
        return { status: "error", message: error ?? "Could not start checkout." };
    }

    const ready = await loadRazorpay();
    if (!ready || !window.Razorpay) {
        return { status: "error", message: "Could not load the payment window." };
    }

    return new Promise<UpgradeOutcome>((resolve) => {
        const rzp = new window.Razorpay!({
            key: order.keyId,
            order_id: order.orderId,
            amount: order.amount,
            currency: order.currency,
            name: "PageCraft",
            description: `Upgrade to ${plan}`,
            theme: { color: "#e07a3f" },
            modal: { ondismiss: () => resolve({ status: "cancelled" }) },
            handler: (result) => {
                void apiPost<{ plan: PaidPlan }>("/api/v1/billing/verify", {
                    razorpay_order_id: result.razorpay_order_id,
                    razorpay_payment_id: result.razorpay_payment_id,
                    razorpay_signature: result.razorpay_signature,
                }).then(({ data, error: verifyError }) => {
                    if (verifyError || !data) {
                        resolve({ status: "error", message: verifyError ?? "Payment could not be verified." });
                    } else {
                        resolve({ status: "upgraded", plan: data.plan });
                    }
                });
            },
        });
        rzp.open();
    });
}
