import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

import { ApiError } from "@/lib/errors/respond";

// The payment provider, behind one door (R3).
//
// Razorpay is reached from exactly two places: an order is created here, and a webhook is
// verified here. Everything else in the app talks about entitlements and knows nothing
// about a gateway. That is the same shape as lib/deploy/provider.ts, and for the same
// reason — if this ever becomes Cashfree or PhonePe, one file changes.
//
// Read from process.env rather than serverEnv(): serverEnv throws when any variable it
// knows about is missing, so adding these there would break every route for anyone who has
// not pulled the new keys. They fold in once the whole team has them.

const KEY_ID = process.env.RAZORPAY_KEY_ID?.trim();
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET?.trim();
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();

const ORDERS_URL = "https://api.razorpay.com/v1/orders";

function razorpayAuthHeader(): string {
    const { keyId, keySecret } = credentials();
    return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export type OrderKind =
    | "publish"
    | "edit_unlock"
    | "pro"
    | "premium"
    | "template"
    | "style"
    | "advanced"
    | "generation_pass";

export interface OrderNotes {
    userId: string;
    kind: OrderKind;
    /** Present for a publish order; omitted for item and account unlocks. */
    projectId?: string;
    /** Catalogue design being bought. */
    templateId?: string;
    /** Generated look being bought (`photos` or `motion`). */
    styleId?: string;
    /** Scratch-card code applied when the order was created. */
    discountCode?: string;
    /** List price in rupees, as a string because Razorpay notes are strings. */
    listPriceInr?: string;
    /** Amount charged in rupees after the card, as a string. */
    paidInr?: string;
}

/** True when this process can create an order. Missing keys fail at checkout, not at boot. */
export function paymentsConfigured(): boolean {
    return Boolean(KEY_ID && KEY_SECRET);
}

export interface RazorpayOrder {
    id: string;
    amount: number;
    currency: string;
}

function credentials(): { keyId: string; keySecret: string } {
    if (!KEY_ID || !KEY_SECRET) {
        console.error(
            "[payments] missing RAZORPAY_KEY_ID and/or RAZORPAY_KEY_SECRET — cannot create or verify orders",
        );
        throw new ApiError(
            "payments_unavailable",
            "Payments are not set up on this server.",
            "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required",
        );
    }
    return { keyId: KEY_ID, keySecret: KEY_SECRET };
}

/** The key the browser needs to open checkout. Public by design; the secret never is. */
export function publishableKeyId(): string {
    return credentials().keyId;
}

/**
 * Ask Razorpay for an order.
 *
 * `notes` travel with the order and come back on the webhook, which is how a payment is
 * matched to the project it unlocks without inventing a table to remember it in. They are
 * written here, server-side, and never taken from the request — a caller who could name the
 * project being paid for could unlock somebody else's.
 */
export async function createOrder(
    amountInPaise: number,
    receipt: string,
    notes: OrderNotes,
): Promise<RazorpayOrder> {
    const auth = razorpayAuthHeader();

    let response: Response;
    try {
        response = await fetch(ORDERS_URL, {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/json" },
            body: JSON.stringify({
                amount: amountInPaise,
                currency: "INR",
                receipt: receipt.slice(0, 40),
                notes,
            }),
        });
    } catch (error) {
        const detail = error instanceof Error ? error.message : "fetch failed";
        console.error("[razorpay] order request failed", detail);
        throw new ApiError(
            "payments_unavailable",
            "We could not open Razorpay checkout. Please try again in a moment.",
            detail,
        );
    }

    let body: Record<string, unknown>;
    try {
        body = (await response.json()) as Record<string, unknown>;
    } catch {
        console.error("[razorpay] order response was not readable", response.status);
        throw new ApiError(
            "payments_unavailable",
            "We could not open Razorpay checkout. Please try again in a moment.",
            `razorpay ${response.status}`,
        );
    }

    if (!response.ok) {
        const error = body.error as
            | { description?: string; code?: string; reason?: string }
            | undefined;
        const detail = error?.description ?? `razorpay ${response.status}`;

        // The description was only ever passed as ApiError's third argument, which nothing
        // logs and nothing returns. So a wrong key, a live/test mismatch or a rejected
        // amount all arrived on screen as the same sentence with the reason discarded.
        console.error(
            `[razorpay] order refused ${response.status}`,
            error?.code ?? "",
            error?.reason ?? "",
            detail,
        );

        throw new ApiError(
            "payments_unavailable",
            "We could not open Razorpay checkout. Please try again in a moment.",
            detail,
        );
    }

    return {
        id: body.id as string,
        amount: Number(body.amount),
        currency: body.currency as string,
    };
}

export interface FetchedOrder {
    id: string;
    amount: number;
    currency: string;
    status: string;
    notes: Partial<OrderNotes>;
}

/**
 * True when Razorpay shows this order as paid (captured or authorized).
 * Used to recover a purchase if the webhook never landed.
 */
export async function orderHasCapturedPayment(orderId: string): Promise<boolean> {
    const response = await fetch(
        `${ORDERS_URL}/${encodeURIComponent(orderId)}/payments`,
        { headers: { Authorization: razorpayAuthHeader() } },
    );
    const body = (await response.json()) as { items?: Array<{ status?: string }> };

    if (!response.ok) return false;
    return (body.items ?? []).some(
        (item) => item.status === "captured" || item.status === "authorized",
    );
}

/**
 * Read an order back from Razorpay (notes + amount). Used after checkout signature
 * verification so the server — not the browser — decides what the payment unlocked.
 */
export async function fetchOrder(orderId: string): Promise<FetchedOrder> {
    const response = await fetch(`${ORDERS_URL}/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: razorpayAuthHeader() },
    });

    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
        const error = body.error as { description?: string } | undefined;
        console.error("[payments] could not fetch Razorpay order", {
            orderId,
            status: response.status,
            description: error?.description,
        });
        throw new ApiError(
            "internal",
            "We couldn't confirm that payment. Please try again in a moment.",
            error?.description ?? `razorpay order ${response.status}`,
        );
    }

    return {
        id: body.id as string,
        amount: Number(body.amount),
        currency: (body.currency as string) ?? "INR",
        status: (body.status as string) ?? "",
        notes: (body.notes ?? {}) as Partial<OrderNotes>,
    };
}

/**
 * Is this webhook really from Razorpay?
 *
 * The signature is an HMAC of the raw body with the webhook secret, so the body must be read
 * as text and checked before it is parsed — re-serialising JSON changes the bytes and the
 * signature stops matching. Compared in constant time: a comparison that returns early
 * leaks, one character at a time, what the right answer would have been.
 *
 * Without this, the endpoint is "anyone who knows the URL can grant themselves a paid
 * feature", which is the whole reason entitlements are server-written.
 */
export function verifyWebhook(rawBody: string, signature: string | null): boolean {
    // Asked first: an unsigned request can never be from Razorpay, whatever this server is
    // configured with. Checking the secret first would answer "we are misconfigured" to
    // something that is simply not a webhook.
    if (!signature) return false;

    if (!WEBHOOK_SECRET) {
        throw new ApiError(
            "internal",
            "Payments are not set up on this server.",
            "RAZORPAY_WEBHOOK_SECRET is required to accept webhooks",
        );
    }

    const expected = createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");

    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Standard checkout signature check.
 *
 * After the Razorpay modal reports success, the browser sends three tokens
 * (order_id, payment_id, signature) to /api/v1/payments/razorpay/verify. The
 * signature is HMAC-SHA256("order_id|payment_id", KEY_SECRET) — note KEY_SECRET,
 * not WEBHOOK_SECRET, because this proves the payment round-trip was genuine, not
 * that a webhook body was.
 *
 * After this passes, the verify route loads the order notes from Razorpay and grants
 * the matching entitlement. The webhook remains a second, idempotent path for the
 * same grant when the browser never reaches verify.
 */
export function verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
): boolean {
    const { keySecret } = credentials();

    const expected = createHmac("sha256", keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");

    return a.length === b.length && timingSafeEqual(a, b);
}

export interface CapturedPayment {
    paymentId: string;
    orderId: string;
    notes: Partial<OrderNotes>;
}

/**
 * The captured payment inside a webhook body, or null if this event is not one.
 *
 * Razorpay sends many event types down one URL. Anything that is not a captured payment is
 * not an error — it is simply not ours to act on, and the endpoint should say 200 and move
 * on rather than making Razorpay retry an event it will never like.
 */
export function capturedPayment(body: unknown): CapturedPayment | null {
    // The body arrives from outside and is whatever the sender chose to send — including
    // null, a string, or an array. Anything that is not an object is not an event.
    if (body === null || typeof body !== "object") return null;

    const event = body as {
        event?: string;
        payload?: { payment?: { entity?: Record<string, unknown> } };
    };

    if (event.event !== "payment.captured") return null;

    const entity = event.payload?.payment?.entity;
    if (!entity) return null;

    const paymentId = entity.id;
    const orderId = entity.order_id;
    if (typeof paymentId !== "string" || typeof orderId !== "string") return null;

    return {
        paymentId,
        orderId,
        notes: (entity.notes ?? {}) as Partial<OrderNotes>,
    };
}
