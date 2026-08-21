import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { startGenerationPassCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/account/packages/generation/checkout — one extra AI round (Rs 199).
export const POST = withRoute({
    auth: "required",
    handler: async ({ userId }) => {
        const checkout = await startGenerationPassCheckout(userId);
        return ok(checkout);
    },
});
