import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const PENDING_COOKIE = "pagecraft_pending";

const TTL_MS = 30 * 60 * 1000;

// The browser that signed up gets a ticket saying "an account is being confirmed for
// this user id". It is signed with SECRET_MASTER_KEY, so it cannot be forged, and it
// carries an expiry so a stolen one is useless after half an hour.
//
// It is not a session and grants nothing on its own. The only thing it permits is
// asking "has this account been confirmed yet", and being signed in if the answer is
// yes -- which is exactly what the person who just signed up is entitled to.
type Ticket = { userId: string; nonce: string; expiresAt: number };

function key(): Buffer | null {
    const raw = process.env.SECRET_MASTER_KEY;

    if (!raw) return null;

    const decoded = Buffer.from(raw, "base64");

    return decoded.length === 32 ? decoded : null;
}

function sign(payload: string, secret: Buffer): string {
    return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function mintPendingTicket(userId: string): string | null {
    const secret = key();

    if (!secret) return null;

    const ticket: Ticket = {
        userId,
        nonce: randomBytes(9).toString("base64url"),
        expiresAt: Date.now() + TTL_MS,
    };

    const payload = Buffer.from(JSON.stringify(ticket), "utf8").toString("base64url");

    return `${payload}.${sign(payload, secret)}`;
}

export function readPendingTicket(value: string | undefined): Ticket | null {
    const secret = key();

    if (!secret || !value) return null;

    const [payload, signature] = value.split(".");

    if (!payload || !signature) return null;

    const expected = Buffer.from(sign(payload, secret));
    const given = Buffer.from(signature);

    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    try {
        const ticket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Ticket;

        if (typeof ticket.userId !== "string" || typeof ticket.expiresAt !== "number") return null;
        if (Date.now() > ticket.expiresAt) return null;

        return ticket;
    } catch {
        return null;
    }
}

export async function setPendingCookie(userId: string): Promise<void> {
    const ticket = mintPendingTicket(userId);

    if (!ticket) return;

    (await cookies()).set(PENDING_COOKIE, ticket, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: TTL_MS / 1000,
    });
}

export async function clearPendingCookie(): Promise<void> {
    (await cookies()).delete(PENDING_COOKIE);
}
