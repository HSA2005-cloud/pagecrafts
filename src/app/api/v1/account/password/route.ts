import "server-only";
import type { z } from "zod";
import { createClient } from "@supabase/supabase-js";

import { withRoute } from "@/lib/kernel/with-route";
import { ok, fail } from "@/lib/errors/respond";
import { passwordChangeSchema } from "@/lib/contracts/schemas";
import { publicEnv } from "@/lib/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = z.infer<typeof passwordChangeSchema>;

// POST /api/v1/account/password — change password while signed in.
export const POST = withRoute<Body>({
  auth: "required",
  schema: passwordChangeSchema,
  handler: async ({ supabase, body }) => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (userError || !email) {
      return fail("unauthorized", "Sign in again, then change your password.");
    }

    // Confirm the current password with a fresh auth client so a wrong password
    // cannot quietly update the signed-in session.
    const probe = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: checkError } = await probe.auth.signInWithPassword({
      email,
      password: body.currentPassword,
    });
    if (checkError) {
      return fail("unauthorized", "That current password is not right. Try again.");
    }

    const { error } = await supabase.auth.updateUser({ password: body.password });
    if (error) {
      return fail(
        "validation_failed",
        "That new password was not accepted. Try a different one.",
      );
    }

    return ok({ updated: true as const });
  },
});
