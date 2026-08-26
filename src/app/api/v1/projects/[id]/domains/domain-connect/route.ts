import "server-only";

import { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { startDomainConnect } from "@/lib/domains/domain-connect/start";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };
type Body = { name: string };

const bodySchema = z.object({
  name: z.string().trim().min(1).max(253),
});

// POST /api/v1/projects/{id}/domains/domain-connect
export const POST = withRoute<Body, Params>({
  auth: "required",
  schema: bodySchema,
  handler: async ({ supabase, userId, params, body }) =>
    ok(await startDomainConnect(supabase, userId, params.id, body.name)),
});
