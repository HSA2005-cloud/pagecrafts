import "server-only";
import { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { getProject } from "@/lib/data/projects";
import { getProjectFiles } from "@/lib/data/project-files";
import { accountPlan } from "@/lib/data/entitlements";
import {
  confirmPage,
  confirmedPages,
  planLocksConfirmedPages,
} from "@/lib/data/page-locks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

const confirmSchema = z.object({
  path: z.string().min(1).max(200),
});

type ConfirmBody = z.infer<typeof confirmSchema>;

/** index.html first, then the rest alphabetically — the order the walkthrough walks. */
function orderedPages(files: Record<string, string>): string[] {
  const pages = Object.keys(files)
    .filter((path) => /\.html?$/i.test(path))
    .sort();

  const home = pages.find((path) => path === "index.html");

  return home ? [home, ...pages.filter((path) => path !== home)] : pages;
}

/**
 * GET /api/v1/projects/{id}/pages — the walkthrough's view of a site.
 *
 * Every page, which of them are confirmed, and whether confirming is final on this plan.
 * The browser needs the last one to say so before somebody presses the button, not after.
 */
export const GET = withRoute<undefined, Params>({
  handler: async ({ supabase, params, userId }) => {
    const [project, { files }, plan] = await Promise.all([
      getProject(supabase, params.id),
      getProjectFiles(supabase, params.id),
      accountPlan(supabase, userId),
    ]);

    const confirmed = confirmedPages(project.siteMeta);
    const final = planLocksConfirmedPages(plan);

    return ok({
      plan,
      /** True when confirming cannot be undone — Starter. */
      confirm_is_final: final,
      pages: orderedPages(files).map((path) => ({
        path,
        confirmed: confirmed.includes(path),
        locked: final && confirmed.includes(path),
      })),
    });
  },
});

/**
 * POST /api/v1/projects/{id}/pages — mark one page confirmed.
 *
 * Deliberately not part of the file save. Confirming is a decision about a page, and on
 * Starter it is irreversible; it should take a press of its own rather than ride along with
 * an autosave nobody asked for.
 */
export const POST = withRoute<ConfirmBody, Params>({
  schema: confirmSchema,
  handler: async ({ supabase, params, body, userId }) => {
    const { files } = await getProjectFiles(supabase, params.id);

    if (!(body.path in files)) {
      return ok({ confirmed: confirmedPages((await getProject(supabase, params.id)).siteMeta) });
    }

    const confirmed = await confirmPage(supabase, params.id, body.path);
    const plan = await accountPlan(supabase, userId);

    return ok({
      confirmed,
      confirm_is_final: planLocksConfirmedPages(plan),
    });
  },
});
