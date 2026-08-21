import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { startStyleCheckout } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

// POST /api/v1/styles/{id}/checkout — buy one generated look (photos or motion).
export const POST = withRoute<undefined, Params>({
  handler: async ({ supabase, params, userId }) =>
    ok(await startStyleCheckout(supabase, userId, params.id)),
});
