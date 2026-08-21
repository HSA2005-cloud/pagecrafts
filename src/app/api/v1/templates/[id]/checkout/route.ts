import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { startTemplateCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

// POST /api/v1/templates/{id}/checkout — buy one catalogue design.
export const POST = withRoute<undefined, Params>({
  handler: async ({ supabase, params, userId }) =>
    ok(await startTemplateCheckout(supabase, userId, params.id)),
});
