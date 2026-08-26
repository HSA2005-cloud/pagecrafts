import "server-only";

import { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { connectDomain, listDomains } from "@/lib/data/domains";
import { connectDomainSchema } from "@/lib/contracts/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };
type Body = z.infer<typeof connectDomainSchema>;

// GET /api/v1/projects/{id}/domains — custom domains for this site.
export const GET = withRoute<undefined, Params>({
  auth: "required",
  handler: async ({ supabase, params }) =>
    ok({ items: await listDomains(supabase, params.id) }),
});

// POST /api/v1/projects/{id}/domains — connect a domain the owner already has.
export const POST = withRoute<Body, Params>({
  auth: "required",
  schema: connectDomainSchema,
  handler: async ({ supabase, params, userId, body }) =>
    ok(await connectDomain(supabase, userId, params.id, body.name), 201),
});
