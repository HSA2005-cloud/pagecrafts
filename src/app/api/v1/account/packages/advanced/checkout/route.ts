import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { optionalDiscountCheckoutSchema } from "@/lib/contracts/schemas";
import { startAdvancedCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = z.infer<typeof optionalDiscountCheckoutSchema>;

// POST /api/v1/account/packages/advanced/checkout — buy Advanced AI usage (Rs 699).
export const POST = withRoute<Body>({
    auth: "required",
    schema: optionalDiscountCheckoutSchema,
    handler: async ({ userId, supabase, body }) => {
        const checkout = await startAdvancedCheckout(supabase, userId, body.discountCode);
        return ok(checkout);
    },
});
