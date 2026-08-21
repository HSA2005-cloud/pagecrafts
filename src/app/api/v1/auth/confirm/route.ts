import "server-only";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/auth/server";
import { confirmDestination } from "@/lib/auth/confirm-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One route for every emailed link. Supabase sends either a PKCE `code` (the
// default template) or a `token_hash` plus `type` ("signup" for confirmation,
// "recovery" for a password reset). Both are traded for a real session cookie,
// then we send the user where they were going.
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type") as EmailOtpType | null;
    const next = confirmDestination(type, url.searchParams.get("next"));

    const supabase = await supabaseRouteClient();

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
            console.error("[auth/confirm]", error.code ?? error.status, error.message);
            redirect("/signin?error=expired");
        }

        redirect(next);
    }

    if (!tokenHash || !type) {
        redirect("/signin?error=expired");
    }

    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (error) {
        redirect("/signin?error=expired");
    }

    redirect(next);
}
