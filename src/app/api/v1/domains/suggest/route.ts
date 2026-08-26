import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok, ApiError } from "@/lib/errors/respond";
import { domainRegistrar } from "@/lib/domains/registrar";
import { suggestDomainCandidates } from "@/lib/domains/suggest";
import { validateHostname } from "@/lib/domains/hostname";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/domains/suggest?name=Kettle+Co — first available .in / .co.in / .com suggestion.
export const GET = withRoute({
    auth: "required",
    handler: async ({ req }) => {
        const siteName = new URL(req.url).searchParams.get("name")?.trim() ?? "";
        if (!siteName) {
            throw new ApiError("validation_failed", "Enter a site name to suggest a domain.");
        }

        const candidates = suggestDomainCandidates(siteName);
        const tried: Array<{
            name: string;
            available: boolean;
            priceInr: number;
            renewalInr: number;
            quoteExpiresAt: string;
        }> = [];

        for (const candidate of candidates) {
            const checked = validateHostname(candidate);
            if (!checked.ok) continue;
            const quote = await domainRegistrar().search(checked.name);
            tried.push({
                name: checked.name,
                available: quote.available,
                priceInr: quote.priceInr,
                renewalInr: quote.renewalInr,
                quoteExpiresAt: quote.quoteExpiresAt,
            });
            if (quote.available) {
                return ok({
                    suggestion: tried[tried.length - 1],
                    alternatives: tried,
                });
            }
        }

        return ok({
            suggestion: null,
            alternatives: tried,
            message: "No free .in / .co.in / .com match from that name. Try a shorter shop name.",
        });
    },
});
