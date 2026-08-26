import "server-only";
import { cookies } from "next/headers";
import { supabaseRouteClient } from "@/lib/auth/server";
import { supabaseAdminOrNull } from "@/lib/data/supabase-admin";
import { currentUser, toSessionUser } from "@/lib/auth/session";
import { ok, fail, guard } from "@/lib/errors/respond";
import { consume } from "@/lib/limits/rate-limit";
import { clientIp, UNKNOWN_IP } from "@/lib/limits/client-ip";
import { PENDING_COOKIE, readPendingTicket, clearPendingCookie } from "@/lib/auth/pending-signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_LIMIT = { limit: 60, windowMs: 5 * 60 * 1000 };

// GET /api/v1/auth/pending — "has my email been confirmed yet, and if so, sign me in".
//
// The waiting page calls this every few seconds. It exists because confirming on a
// phone creates a session on the phone, and the laptop that started the signup is left
// staring at a page that will never change on its own.
//
// What makes it safe to hand out a session here is the ticket cookie: httpOnly, signed,
// half an hour, set only on the browser that performed the signup. No ticket, no answer.
// It is also the only thing checked, so knowing somebody's email is worth nothing.
export async function GET(request: Request) {
    return guard(async () => {
        const ip = clientIp(request.headers);

        if (ip !== UNKNOWN_IP) {
            const budget = await consume("auth:pending", ip, POLL_LIMIT);

            if (!budget.allowed) {
                return fail("rate_limited", "Slow down a moment.");
            }
        }

        // Already signed in — the confirmation happened in this browser.
        const signedIn = await currentUser();

        if (signedIn) {
            await clearPendingCookie();
            return ok({ status: "signed_in" as const, user: signedIn });
        }

        const ticket = readPendingTicket((await cookies()).get(PENDING_COOKIE)?.value);

        if (!ticket) {
            return ok({ status: "unknown" as const });
        }

        const admin = supabaseAdminOrNull();

        if (!admin) {
            return ok({ status: "waiting" as const });
        }

        const { data, error } = await admin.auth.admin.getUserById(ticket.userId);

        if (error || !data.user) {
            return ok({ status: "waiting" as const });
        }

        if (!data.user.email_confirmed_at) {
            return ok({ status: "waiting" as const });
        }

        // Confirmed elsewhere. Mint a one-time link for this exact user and redeem it
        // here, which is what writes the session cookies onto this browser. The link
        // never leaves the server.
        const email = data.user.email;

        if (!email) return ok({ status: "waiting" as const });

        const link = await admin.auth.admin.generateLink({ type: "magiclink", email });

        if (link.error || !link.data.properties?.hashed_token) {
            console.error("[auth/pending] could not mint a link", link.error?.message);
            return ok({ status: "waiting" as const });
        }

        const supabase = await supabaseRouteClient();
        const { data: session, error: verifyError } = await supabase.auth.verifyOtp({
            type: "magiclink",
            token_hash: link.data.properties.hashed_token,
        });

        if (verifyError || !session.user) {
            console.error("[auth/pending]", verifyError?.message);
            return ok({ status: "waiting" as const });
        }

        await clearPendingCookie();

        return ok({ status: "signed_in" as const, user: toSessionUser(session.user) });
    });
}
