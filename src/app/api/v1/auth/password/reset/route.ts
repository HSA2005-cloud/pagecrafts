import "server-only";
import type { NextRequest } from "next/server";
import { supabaseRouteClient } from "@/lib/auth/server";
import { passwordResetRequestSchema } from "@/lib/contracts/auth";
import { authConfirmUrl } from "@/lib/auth/confirm-url";
import { ok, fail, guard } from "@/lib/errors/respond";
import { readJson } from "@/lib/kernel/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    return guard(async () => {
        const json = await readJson(request);
        const parsed = passwordResetRequestSchema.safeParse(json);

        if (!parsed.success) {
            return fail("validation_failed", "Enter a valid email address.");
        }

        const supabase = await supabaseRouteClient();
        await supabase.auth.resetPasswordForEmail(parsed.data.email, {
            redirectTo: `${authConfirmUrl()}?next=${encodeURIComponent("/reset")}`,
        });

        // SEC-05: the same answer whether or not this address has an account.
        // Never let a caller learn who is registered by watching the response.
        return ok({ status: "accepted" as const }, 202);
    });
}
