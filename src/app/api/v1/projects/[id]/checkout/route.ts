import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { optionalDiscountCheckoutSchema } from "@/lib/contracts/schemas";
import { startPublishCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };
type Body = z.infer<typeof optionalDiscountCheckoutSchema>;

// POST /api/v1/projects/{id}/checkout — what does it cost to put this site live? (R3)
//
// The one place the price appears, at the one moment it applies (Doc 22 P2/P3). Answers one
// of two things: `granted: true`, meaning publish will go through and there is nothing to
// pay; or an order for the browser to open Razorpay checkout with.
//
// Paying does not grant anything. The browser reporting success is a claim, not a fact —
// anyone can make that call. The entitlement is written when the signed webhook arrives,
// which is why /api/v1/payments/razorpay/webhook exists at all.
export const POST = withRoute<Body, Params>({
  schema: optionalDiscountCheckoutSchema,
  handler: async ({ supabase, params, userId, body }) =>
    ok(await startPublishCheckout(supabase, userId, params.id, body.discountCode)),
});
