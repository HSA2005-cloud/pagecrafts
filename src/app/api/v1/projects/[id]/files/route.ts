import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { MAX_SITE_BODY_BYTES } from "@/lib/kernel/body";
import { ok } from "@/lib/errors/respond";
import { putFilesSchema } from "@/lib/contracts/schemas";
import { getProjectFiles, putProjectFiles } from "@/lib/data/project-files";
import { assertCanEdit } from "@/lib/data/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };
type PutBody = z.infer<typeof putFilesSchema>;

// GET /api/v1/projects/{id}/files — the working tree.
export const GET = withRoute<undefined, Params>({
  handler: async ({ supabase, params }) => ok(await getProjectFiles(supabase, params.id)),
});

// PUT /api/v1/projects/{id}/files — replace the working tree (marks dirty; does not commit).
//
// This body is a whole site, so the ordinary 64 KB guard does not apply: a nine-page
// generated site is 120 KB at its plainest. validateFileMap owns the real limit (2 MB of
// text, 50 files) and explains itself when a site is genuinely too big; the transport guard
// only has to stop something absurd before we read it into memory.
export const PUT = withRoute<PutBody, Params>({
  schema: putFilesSchema,
  maxBodyBytes: MAX_SITE_BODY_BYTES,
  handler: async ({ supabase, params, body, userId }) =>
    {
    // Doc 22 P5: a live site needs an edit unlock, after the goodwill window (R3 D14).
    await assertCanEdit(supabase, userId, params.id);
    return ok(await putProjectFiles(supabase, params.id, body.files, body.expectedUpdatedAt));
  }
});
