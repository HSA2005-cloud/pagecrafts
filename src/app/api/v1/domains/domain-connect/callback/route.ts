import "server-only";

import { NextResponse } from "next/server";

import { verifyDomainConnectState } from "@/lib/domains/domain-connect/apply";
import { verifyDomain } from "@/lib/data/domains";
import { supabaseAdmin } from "@/lib/data/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function editorUrl(projectId: string, query: Record<string, string>): string {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const url = new URL(`${origin}/editor/${projectId}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * GET /api/v1/domains/domain-connect/callback
 * Registrar redirects here after Authorize. We re-check DNS/host status and send
 * the shop owner back to the editor.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const error = url.searchParams.get("error");

  const payload = verifyDomainConnectState(state);
  if (!payload) {
    return NextResponse.redirect(
      new URL(
        `/?domain_connect=invalid${error ? `&error=${encodeURIComponent(error)}` : ""}`,
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      ),
    );
  }

  if (error) {
    return NextResponse.redirect(
      editorUrl(payload.projectId, {
        domain_connect: "cancelled",
        domain: payload.domain,
      }),
    );
  }

  try {
    const admin = supabaseAdmin();
    const { data: row } = await admin
      .from("domains")
      .select("id")
      .eq("project_id", payload.projectId)
      .eq("name", payload.domain)
      .maybeSingle();

    if (row?.id) {
      await verifyDomain(admin, payload.userId, payload.projectId, row.id as string);
    }
  } catch {
    // Still send them back — DNS may need a few minutes.
  }

  return NextResponse.redirect(
    editorUrl(payload.projectId, {
      domain_connect: "ok",
      domain: payload.domain,
    }),
  );
}
