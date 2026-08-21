import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok, fail } from "@/lib/errors/respond";
import { readJson } from "@/lib/kernel/body";
import { readCredentials } from "@/lib/auth/credentials";
import {
  authenticateWithPassword,
  passwordAttemptResponse,
  PASSWORD_GENERIC_FAILURE,
} from "@/lib/auth/password-check";
import { deleteAccount, getAccount } from "@/lib/data/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/account — what we hold about the person asking.
export const GET = withRoute({
  auth: "required",
  handler: async ({ supabase }) => ok(await getAccount(supabase)),
});

// DELETE /api/v1/account — remove the account and everything it owns.
//
// A session is not enough: the same email + password check as sign-in has to succeed first
// (same pattern as deleting a site). The interface still asks them to type the words and
// shows what they lose — bought templates included — so a stolen cookie alone cannot wipe
// the account.
//
// A published site is not deleted. It is theirs, on hosting they were given, and closing an
// account is not the same request as taking a website off the internet (C-12).
export const DELETE = withRoute({
  auth: "required",
  handler: async ({ req, supabase, userId, email }) => {
    const json = await readJson(req);
    const credentials = readCredentials(json);

    if (!credentials.ok) {
      return fail("unauthorized", PASSWORD_GENERIC_FAILURE);
    }

    const sessionEmail = email.trim().toLowerCase();
    if (!sessionEmail || credentials.value.email !== sessionEmail) {
      return fail("unauthorized", PASSWORD_GENERIC_FAILURE);
    }

    const result = await authenticateWithPassword({
      headers: req.headers,
      supabase,
      email: credentials.value.email,
      password: credentials.value.password,
    });

    if (!result.ok) {
      return passwordAttemptResponse(result);
    }

    await deleteAccount(userId);
    return ok({ deleted: true as const });
  },
});
