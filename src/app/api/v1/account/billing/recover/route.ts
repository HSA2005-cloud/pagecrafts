import "server-only";
import { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { recoverPaidOrder } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  orderId: z.string().min(1).max(64),
});

type Body = z.infer<typeof schema>;

// POST /api/v1/account/billing/recover — unlock a plan that was paid but never granted
// (webhook missed, session expired during Razorpay). Order id is on the Razorpay receipt.
export const POST = withRoute<Body>({
  auth: "required",
  schema,
  handler: async ({ userId, body }) =>
    ok(await recoverPaidOrder(userId, body.orderId)),
});
