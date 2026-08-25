import "server-only";
import type { z } from "zod";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { discountPreviewSchema } from "@/lib/contracts/schemas";
import { previewDiscount } from "@/lib/payments/discount-codes";
import {
    ADVANCED_PACKAGE_PRICE_INR,
    GENERATION_PASS_PRICE_INR,
} from "@/lib/limits/config";
import { PREMIUM_PRICE_INR, PRO_PRICE_INR, TIER_PRICE_INR } from "@/lib/payments/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = z.infer<typeof discountPreviewSchema>;

function listPriceFor(kind: Body["kind"]): number {
    if (kind === "premium") return PREMIUM_PRICE_INR;
    if (kind === "pro") return PRO_PRICE_INR;
    if (kind === "advanced") return ADVANCED_PACKAGE_PRICE_INR;
    if (kind === "generation_pass") return GENERATION_PASS_PRICE_INR;
    return TIER_PRICE_INR.premium;
}

// POST /api/v1/payments/discount/preview — show what a scratch-card would take off
// before Razorpay opens. Does not hold or spend the code.
export const POST = withRoute<Body>({
    auth: "required",
    schema: discountPreviewSchema,
    handler: async ({ userId, body }) =>
        ok(await previewDiscount(userId, body.kind, listPriceFor(body.kind), body.code)),
});
