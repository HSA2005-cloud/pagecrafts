import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { notifyPrefsRequestSchema } from "@/lib/contracts/schemas";
import { setNotifyPrefs } from "@/lib/data/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = z.infer<typeof notifyPrefsRequestSchema>;

// PATCH /api/v1/account/notifications — which email notices this account wants.
export const PATCH = withRoute<Body>({
  auth: "required",
  schema: notifyPrefsRequestSchema,
  handler: async ({ supabase, body }) => ok(await setNotifyPrefs(supabase, body.notifyPrefs)),
});
