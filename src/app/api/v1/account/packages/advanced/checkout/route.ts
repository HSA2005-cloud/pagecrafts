import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { startAdvancedCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/account/packages/advanced/checkout — buy Advanced AI usage (Rs 699).
export const POST = withRoute({
    auth: "required",
    handler: async ({ userId, supabase }) => {
        const checkout = await startAdvancedCheckout(supabase, userId);
        return ok(checkout);
    },
});
