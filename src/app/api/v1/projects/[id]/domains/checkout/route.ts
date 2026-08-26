import "server-only";
import type { z } from "zod";
import { z as zod } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { startDomainCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = zod.object({
    name: zod.string().min(3).max(253),
    discountCode: zod.string().trim().min(1).max(64).optional(),
});

type Params = { id: string };
type Body = z.infer<typeof bodySchema>;

// POST /api/v1/projects/{id}/domains/checkout — pay to register + attach a custom domain.
export const POST = withRoute<Body, Params>({
    schema: bodySchema,
    handler: async ({ supabase, params, userId, body }) =>
        ok(await startDomainCheckout(supabase, userId, params.id, body.name, body.discountCode)),
});
