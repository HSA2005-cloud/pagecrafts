import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { optionalDiscountCheckoutSchema } from "@/lib/contracts/schemas";
import { startGenerationPassCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = z.infer<typeof optionalDiscountCheckoutSchema>;

// POST /api/v1/account/packages/generation/checkout — one extra AI round (Rs 199).
export const POST = withRoute<Body>({
    auth: "required",
    schema: optionalDiscountCheckoutSchema,
    handler: async ({ userId, body }) => {
        const checkout = await startGenerationPassCheckout(userId, body.discountCode);
        return ok(checkout);
    },
});
