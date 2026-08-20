import "server-only";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { supabaseRouteClient } from "@/lib/auth/server";
import { publicEnv } from "@/lib/config/env";
import { safeNext } from "@/lib/auth/safe-next";
import { authCallbackUrl } from "@/lib/auth/email-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const next = safeNext(url.searchParams.get("next"));

    const supabase = await supabaseRouteClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: authCallbackUrl(publicEnv.appUrl, next),
            queryParams: { prompt: "select_account" },
        },
    });

    if (error || !data.url) {
        console.error("[auth/google]", error?.code ?? error?.status, error?.message);
        redirect("/signin?error=google_unavailable");
    }

    redirect(data.url);
}
