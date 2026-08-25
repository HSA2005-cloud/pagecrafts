import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { optionalDiscountCheckoutSchema } from "@/lib/contracts/schemas";
import { startTemplateCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };
type Body = z.infer<typeof optionalDiscountCheckoutSchema>;

// POST /api/v1/templates/{id}/checkout — buy one catalogue design.
export const POST = withRoute<Body, Params>({
  schema: optionalDiscountCheckoutSchema,
  handler: async ({ supabase, params, userId, body }) =>
    ok(await startTemplateCheckout(supabase, userId, params.id, body.discountCode)),
});
