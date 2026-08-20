import "server-only";
import type { NextRequest } from "next/server";
import { supabaseRouteClient } from "@/lib/auth/server";
import { passwordResetRequestSchema } from "@/lib/contracts/auth";
import { publicEnv } from "@/lib/config/env";
import { authConfirmUrl } from "@/lib/auth/email-urls";
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
        await supabase.auth.resend({
            type: "signup",
            email: parsed.data.email,
            options: { emailRedirectTo: authConfirmUrl(publicEnv.appUrl, "/new") },
        });

        return ok({ status: "accepted" as const }, 202);
    });
}
