import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { planCheckoutSchema } from "@/lib/contracts/schemas";
import { startPlanCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = z.infer<typeof planCheckoutSchema>;

// POST /api/v1/account/billing/checkout — start paying for Pro or Premium.
//
// Paying does not grant anything; the entitlement is written when the signed webhook
// arrives with notes.kind = "pro" | "premium".
export const POST = withRoute<Body>({
  auth: "required",
  schema: planCheckoutSchema,
  handler: async ({ supabase, userId, body }) =>
    ok(await startPlanCheckout(supabase, userId, body.plan)),
});
