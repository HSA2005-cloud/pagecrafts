import "server-only";
import type { NextRequest } from "next/server";
import { supabaseRouteClient } from "@/lib/auth/server";
import { readCredentials } from "@/lib/auth/credentials";
import { toSessionUser } from "@/lib/auth/session";
import { ok, fail, guard } from "@/lib/errors/respond";
import { readJson } from "@/lib/kernel/body";
import { consume, type LimitResult } from "@/lib/limits/rate-limit";
import { clientIp, UNKNOWN_IP } from "@/lib/limits/client-ip";
import { LOGIN_PER_IP, LOGIN_PER_EMAIL } from "@/lib/limits/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_FAILURE = "That email and password combination is not correct.";
const THROTTLED = "Too many sign-in attempts. Try again in a few minutes.";

function throttled(result: LimitResult, scope: string) {
  if (result.degraded) {
    console.error("[login] rate limiter unavailable, refusing sign-in", { scope });
  }

  const response = fail("rate_limited", THROTTLED);
  response.headers.set("Retry-After", String(result.retryAfterSeconds));
  return response;
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    const ip = clientIp(request.headers);
    // #region agent log
    require("node:fs").appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({ hypothesisId: "A,B", location: "src/app/api/v1/auth/login/route.ts:POST-entry", message: "login request entered", data: { hasKnownIp: ip !== UNKNOWN_IP }, timestamp: Date.now() }) + "\n");
    // #endregion

    if (ip !== UNKNOWN_IP) {
      const byIp = await consume("login:ip", ip, LOGIN_PER_IP);
      // #region agent log
      require("node:fs").appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({ hypothesisId: "A,B", location: "src/app/api/v1/auth/login/route.ts:ip-limit", message: "IP limiter consumed", data: { allowed: byIp.allowed, remaining: byIp.remaining, retryAfterSeconds: byIp.retryAfterSeconds, degraded: byIp.degraded }, timestamp: Date.now() }) + "\n");
      // #endregion

      if (!byIp.allowed) {
        return throttled(byIp, "ip");
      }
    }

    const body = await readJson(request);

    if (body === null) {
      return fail("validation_failed", "Send a JSON body with email and password.");
    }

    const credentials = readCredentials(body);
    // #region agent log
    require("node:fs").appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({ hypothesisId: "B", location: "src/app/api/v1/auth/login/route.ts:credentials", message: "login body classified", data: { hasJsonBody: body !== null, credentialsValid: credentials.ok }, timestamp: Date.now() }) + "\n");
    // #endregion

    if (!credentials.ok) {
      return fail("unauthorized", GENERIC_FAILURE);
    }

    const email = credentials.value.email.trim().toLowerCase();
    const byEmail = await consume("login:email", email, LOGIN_PER_EMAIL);
    // #region agent log
    require("node:fs").appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({ hypothesisId: "C", location: "src/app/api/v1/auth/login/route.ts:email-limit", message: "email limiter consumed", data: { allowed: byEmail.allowed, remaining: byEmail.remaining, retryAfterSeconds: byEmail.retryAfterSeconds, degraded: byEmail.degraded }, timestamp: Date.now() }) + "\n");
    // #endregion

    if (!byEmail.allowed) {
      return throttled(byEmail, "email");
    }

    const supabase = await supabaseRouteClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.value.email,
      password: credentials.value.password,
    });
    // #region agent log
    require("node:fs").appendFileSync("/opt/cursor/logs/debug.log", JSON.stringify({ hypothesisId: "D", location: "src/app/api/v1/auth/login/route.ts:supabase-result", message: "auth provider returned", data: { hasUser: Boolean(data.user), hasError: Boolean(error), errorStatus: error?.status ?? null, errorCode: error?.code ?? null }, timestamp: Date.now() }) + "\n");
    // #endregion

    if (error) {
      if (error.status === 429) {
        return fail("rate_limited", THROTTLED);
      }
      if (error.code === "email_not_confirmed") {
        return fail(
          "forbidden",
          "Confirm your email address to finish setting up your account.",
        );
      }
      return fail("unauthorized", GENERIC_FAILURE);
    }

    if (!data.user) {
      return fail("unauthorized", GENERIC_FAILURE);
    }

    return ok({ user: toSessionUser(data.user) });
  });
}
