import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok, fail } from "@/lib/errors/respond";
import { readJson } from "@/lib/kernel/body";
import { readCredentials } from "@/lib/auth/credentials";
import {
  authenticateWithPassword,
  passwordAttemptResponse,
  PASSWORD_GENERIC_FAILURE,
} from "@/lib/auth/password-check";
import { patchProjectSchema } from "@/lib/contracts/schemas";
import { deleteProject, getProject, patchProject } from "@/lib/data/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };
type PatchBody = z.infer<typeof patchProjectSchema>;

// GET /api/v1/projects/{id}
export const GET = withRoute<undefined, Params>({
  handler: async ({ supabase, params }) => ok(await getProject(supabase, params.id)),
});

// PATCH /api/v1/projects/{id} — name, site_meta, form_endpoint (S-2, S-3, S-4).
export const PATCH = withRoute<PatchBody, Params>({
  schema: patchProjectSchema,
  handler: async ({ supabase, params, body }) =>
    ok(await patchProject(supabase, params.id, body)),
});

// DELETE /api/v1/projects/{id} — removes our row only (C-12).
//
// A session is not enough: the same email + password check as sign-in has to succeed first.
// The address in the body must be this session's address, so a stolen cookie cannot be
// paired with somebody else's password, and signInWithPassword cannot switch the session.
export const DELETE = withRoute<undefined, Params>({
  handler: async ({ req, supabase, params, email }) => {
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

    await deleteProject(supabase, params.id);
    return ok({ deleted: true });
  },
});
