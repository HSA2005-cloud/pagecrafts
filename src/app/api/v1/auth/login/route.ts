import "server-only";
import type { NextRequest } from "next/server";
import { supabaseRouteClient } from "@/lib/auth/server";
import { readCredentials } from "@/lib/auth/credentials";
import {
  authenticateWithPassword,
  passwordAttemptResponse,
  PASSWORD_GENERIC_FAILURE,
} from "@/lib/auth/password-check";
import { toSessionUser } from "@/lib/auth/session";
import { ok, fail, guard } from "@/lib/errors/respond";
import { readJson } from "@/lib/kernel/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return guard(async () => {
    const body = await readJson(request);

    if (body === null) {
      return fail("validation_failed", "Send a JSON body with email and password.");
    }

    const credentials = readCredentials(body);

    if (!credentials.ok) {
      return fail("unauthorized", PASSWORD_GENERIC_FAILURE);
    }

    const supabase = await supabaseRouteClient();
    const result = await authenticateWithPassword({
      headers: request.headers,
      supabase,
      email: credentials.value.email,
      password: credentials.value.password,
    });

    if (!result.ok) {
      return passwordAttemptResponse(result);
    }

    return ok({ user: toSessionUser(result.user) });
  });
}
