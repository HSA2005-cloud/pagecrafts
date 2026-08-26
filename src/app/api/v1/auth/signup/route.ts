import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseRouteClient } from "@/lib/auth/server";
import { readCredentials } from "@/lib/auth/credentials";
import { toSessionUser } from "@/lib/auth/session";
import { ok, fail, guard } from "@/lib/errors/respond";
import { readJson } from "@/lib/kernel/body";
import { authConfirmUrl } from "@/lib/auth/confirm-url";
import { setPendingCookie } from "@/lib/auth/pending-signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The sign-up panel asks for a name so we can greet people by it later. It is
// optional and never blocks the account: anything unusable is simply dropped.
const nameSchema = z.string().trim().min(1).max(80);

function readName(body: unknown): string | undefined {
  const raw = (body as { name?: unknown } | null)?.name;
  const parsed = nameSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    const body = await readJson(request);

    if (body === null) {
      return fail("validation_failed", "Send a JSON body with email and password.");
    }

    const credentials = readCredentials(body);

    if (!credentials.ok) {
      return fail("validation_failed", credentials.message);
    }

    const name = readName(body);
    const supabase = await supabaseRouteClient();
    const { data, error } = await supabase.auth.signUp({
      email: credentials.value.email,
      password: credentials.value.password,
      options: {
        emailRedirectTo: authConfirmUrl(),
        ...(name ? { data: { full_name: name } } : {}),
      },
    });

    if (error) {
      if (
        error.status === 429 ||
        error.code === "over_request_rate_limit" ||
        error.code === "over_email_send_rate_limit"
      ) {
        return fail("rate_limited", "Too many attempts. Try again shortly.");
      }
      if (error.code === "weak_password") {
        return fail("validation_failed", "Choose a stronger password.");
      }
      if (error.code === "email_address_invalid") {
        return fail("validation_failed", "Enter a valid email address.");
      }
      if (error.code === "signup_disabled") {
        return fail("forbidden", "New accounts are not being accepted right now.");
      }
      if (error.code === "user_already_exists" || error.code === "email_exists") {
        return fail(
          "conflict",
          "That email already has an account. Sign in instead.",
        );
      }
      // Supabase can create the account and still fail while sending the confirmation
      // mail (built-in mailer / missing SMTP). Prefer "check your email" over a hard 500.
      if (/confirmation email|error sending|smtp/i.test(error.message ?? "")) {
        console.error("[auth/signup] mailer", error.code ?? error.status, error.message);
        return ok({ user: null, pending: true }, 202);
      }
      console.error("[auth/signup]", error.code ?? error.status, error.message);
      return fail("internal", "We could not create your account. Try again.");
    }

    // Supabase masks duplicates by returning a user with no identities and no session.
    // Treat that as "already registered" — do not mint a pending ticket (that would let
    // the verify page sign someone in without checking the password they typed).
    const identities = data.user?.identities;
    if (data.user && Array.isArray(identities) && identities.length === 0) {
      return fail(
        "conflict",
        "That email already has an account. Sign in instead.",
      );
    }

    if (!data.user || !data.session) {
      if (data.user) await setPendingCookie(data.user.id);
      return ok({ user: null, pending: true }, 202);
    }

    return ok({ user: toSessionUser(data.user), pending: false }, 201);
  });
}
