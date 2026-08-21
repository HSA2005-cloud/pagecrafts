import "server-only";
import type { NextRequest } from "next/server";
import { supabaseRouteClient } from "@/lib/auth/server";
import { passwordResetRequestSchema } from "@/lib/contracts/auth";
import { authConfirmUrl } from "@/lib/auth/confirm-url";
import { ok, fail, guard } from "@/lib/errors/respond";
import { readJson } from "@/lib/kernel/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function alreadySignedUp(code: string | undefined, message: string): boolean {
    const msg = message.toLowerCase();
    return (
        code === "email_exists" ||
        code === "user_already_exists" ||
        msg.includes("already been registered") ||
        msg.includes("already registered") ||
        msg.includes("already confirmed")
    );
}

export async function POST(request: NextRequest) {
    return guard(async () => {
        const json = await readJson(request);
        const parsed = passwordResetRequestSchema.safeParse(json);

        if (!parsed.success) {
            return fail("validation_failed", "Enter a valid email address.");
        }

        const supabase = await supabaseRouteClient();
        const { error } = await supabase.auth.resend({
            type: "signup",
            email: parsed.data.email,
            options: { emailRedirectTo: authConfirmUrl() },
        });

        if (error) {
            if (error.status === 429 || error.code === "over_email_send_rate_limit") {
                return fail("rate_limited", "Too many emails. Wait a few minutes and try again.");
            }
            if (alreadySignedUp(error.code, error.message)) {
                return ok({ status: "signin" as const }, 200);
            }
            console.error("[auth/verify/resend]", error.code ?? error.status, error.message);
            return fail("internal", "We could not send that email just now. Try again in a moment.");
        }

        return ok({ status: "accepted" as const }, 202);
    });
}
