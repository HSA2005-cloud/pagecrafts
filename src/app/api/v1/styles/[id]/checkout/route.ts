import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { optionalDiscountCheckoutSchema } from "@/lib/contracts/schemas";
import { startStyleCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };
type Body = z.infer<typeof optionalDiscountCheckoutSchema>;

// POST /api/v1/styles/{id}/checkout — buy one generated look (photos or motion).
export const POST = withRoute<Body, Params>({
  schema: optionalDiscountCheckoutSchema,
  handler: async ({ supabase, params, userId, body }) =>
    ok(await startStyleCheckout(supabase, userId, params.id, body.discountCode)),
});
