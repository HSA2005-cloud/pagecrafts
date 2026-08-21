import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok, ApiError } from "@/lib/errors/respond";
import { supabaseAdmin } from "@/lib/data/supabase-admin";
import { isValidUpiId, normaliseUpiId } from "@/lib/sites/upi";
import type { SiteMeta } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * GET /api/v1/pay/[id] — public pay facts for a published / order-taking site.
 * Only returns the UPI ID the owner saved — never account email or other secrets.
 */
export const GET = withRoute<undefined, Params>({
    auth: "none",
    handler: async ({ params }) => {
        const admin = supabaseAdmin();
        const { data, error } = await admin
            .from("projects")
            .select("id, name, site_meta")
            .eq("id", params.id)
            .maybeSingle();

        if (error) {
            throw new ApiError("internal", "Could not read that payment page.", error.message);
        }
        if (!data) throw new ApiError("not_found", "That payment page does not exist.");

        const meta = (data.site_meta as SiteMeta | null) ?? {};
        const upiId = meta.upiId?.trim() ? normaliseUpiId(meta.upiId) : "";
        if (!upiId || !isValidUpiId(upiId)) {
            throw new ApiError("not_found", "This site is not set up to take UPI payments yet.");
        }

        return ok({
            projectId: data.id as string,
            businessName: (meta.title?.trim() || data.name || "This shop") as string,
            upiId,
        });
    },
});
