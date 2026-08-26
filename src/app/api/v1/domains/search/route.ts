import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok, ApiError } from "@/lib/errors/respond";
import { domainRegistrar } from "@/lib/domains/registrar";
import { validateHostname } from "@/lib/domains/hostname";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/domains/search?q= — availability + quote for any signed-in owner (no purchase).
export const GET = withRoute({
  auth: "required",
  handler: async ({ req }) => {
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    const checked = validateHostname(q);
    if (!checked.ok) {
      throw new ApiError("validation_failed", checked.reason);
    }

    const quote = await domainRegistrar().search(checked.name);
    return ok({
      name: checked.name,
      available: quote.available,
      priceInr: quote.priceInr,
      renewalInr: quote.renewalInr,
      quoteExpiresAt: quote.quoteExpiresAt,
    });
  },
});
