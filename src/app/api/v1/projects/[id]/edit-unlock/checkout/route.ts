import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { optionalDiscountCheckoutSchema } from "@/lib/contracts/schemas";
import { startEditUnlockCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };
type Body = z.infer<typeof optionalDiscountCheckoutSchema>;

// POST /api/v1/projects/{id}/edit-unlock/checkout — Rs 249 to edit a live site.
export const POST = withRoute<Body, Params>({
  schema: optionalDiscountCheckoutSchema,
  handler: async ({ supabase, params, userId, body }) =>
    ok(await startEditUnlockCheckout(supabase, userId, params.id, body.discountCode)),
});
