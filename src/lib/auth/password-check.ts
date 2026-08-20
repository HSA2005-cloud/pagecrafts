import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { fail } from "@/lib/errors/respond";
import { consume, type LimitResult } from "@/lib/limits/rate-limit";
import { clientIp, UNKNOWN_IP } from "@/lib/limits/client-ip";
import { LOGIN_PER_IP, LOGIN_PER_EMAIL } from "@/lib/limits/config";

// The sentences login answers with. Site delete reuses this check, so a wrong password
// there must not grow a second vocabulary for the same fact.
export const PASSWORD_GENERIC_FAILURE =
  "That email and password combination is not correct.";
export const PASSWORD_THROTTLED =
  "Too many sign-in attempts. Try again in a few minutes.";

export type PasswordAttemptSuccess = { ok: true; user: User };

export type PasswordAttemptFailure = {
  ok: false;
  code: "unauthorized" | "forbidden" | "rate_limited";
  message: string;
  retryAfterSeconds?: number;
};

export type PasswordAttemptResult = PasswordAttemptSuccess | PasswordAttemptFailure;

function throttled(result: LimitResult, scope: string): PasswordAttemptFailure {
  if (result.degraded) {
    console.error("[password-check] rate limiter unavailable, refusing sign-in", { scope });
  }

  return {
    ok: false,
    code: "rate_limited",
    message: PASSWORD_THROTTLED,
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

/**
 * The same credential check sign-in uses: IP + email rate limits, then
 * `signInWithPassword`. Callers that already know who the person is (a signed-in
 * delete) still go through this so a stolen session is not enough.
 */
export async function authenticateWithPassword(opts: {
  headers: Headers;
  supabase: SupabaseClient;
  email: string;
  password: string;
}): Promise<PasswordAttemptResult> {
  const ip = clientIp(opts.headers);

  if (ip !== UNKNOWN_IP) {
    const byIp = await consume("login:ip", ip, LOGIN_PER_IP);

    if (!byIp.allowed) {
      return throttled(byIp, "ip");
    }
  }

  const email = opts.email.trim().toLowerCase();
  const byEmail = await consume("login:email", email, LOGIN_PER_EMAIL);

  if (!byEmail.allowed) {
    return throttled(byEmail, "email");
  }

  const { data, error } = await opts.supabase.auth.signInWithPassword({
    email,
    password: opts.password,
  });

  if (error) {
    if (error.status === 429) {
      return { ok: false, code: "rate_limited", message: PASSWORD_THROTTLED };
    }
    if (error.code === "email_not_confirmed") {
      return {
        ok: false,
        code: "forbidden",
        message: "Confirm your email address to finish setting up your account.",
      };
    }
    return { ok: false, code: "unauthorized", message: PASSWORD_GENERIC_FAILURE };
  }

  if (!data.user) {
    return { ok: false, code: "unauthorized", message: PASSWORD_GENERIC_FAILURE };
  }

  return { ok: true, user: data.user };
}

export function passwordAttemptResponse(result: PasswordAttemptFailure): Response {
  const response = fail(result.code, result.message);
  if (result.retryAfterSeconds != null) {
    response.headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  return response;
}
