import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { MAX_SITE_BODY_BYTES } from "@/lib/kernel/body";
import { ok } from "@/lib/errors/respond";
import { putFilesSchema } from "@/lib/contracts/schemas";
import { getProjectFiles, putProjectFiles } from "@/lib/data/project-files";
import { assertCanEdit } from "@/lib/data/entitlements";
import { assertPagesEditable } from "@/lib/data/page-locks";

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

    // A page confirmed in the walkthrough is finished on the free plan. The editor sends
    // the whole tree on every save, so what matters is which pages this write would
    // actually change — locking on "sent" would freeze the site the moment one page was
    // confirmed. Compare against what is stored and refuse only the real edits.
    const { files: current } = await getProjectFiles(supabase, params.id);
    const changing = Object.keys(body.files).filter(
      (path) => body.files[path] !== current[path],
    );
    await assertPagesEditable(supabase, userId, params.id, changing);

    return ok(await putProjectFiles(supabase, params.id, body.files, body.expectedUpdatedAt));
  }
});
