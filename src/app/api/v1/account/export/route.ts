import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { getAccount, toAccountExport } from "@/lib/data/account";
import { listProjects } from "@/lib/data/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/account/export — a copy of account facts and site summaries, not file trees.
export const GET = withRoute({
  auth: "required",
  handler: async ({ supabase, userId }) => {
    const account = await getAccount(supabase);
    const sites = await listProjects(supabase, userId);
    return ok(toAccountExport(account, sites));
  },
});
