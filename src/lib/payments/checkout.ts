import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountPlan, BillingSummary, TemplateTier } from "@/lib/contracts";
import { ApiError } from "@/lib/errors/respond";
import { supabaseAdmin } from "@/lib/data/supabase-admin";
import { checkEntitlement, hasStyleAccess, hasTemplateAccess } from "@/lib/data/entitlements";
import { inrToPaise, isFree, PREMIUM_PRICE_INR, PRO_PRICE_INR, publishPriceInr, requiredPlanForStyle, requiredPlanForTemplate, EDIT_UNLOCK_PRICE_INR } from "./pricing";
import {
    createOrder,
    fetchOrder,
    orderHasCapturedPayment,
    paymentsConfigured,
    publishableKeyId,
    verifyPaymentSignature,
    type OrderKind,
    type OrderNotes,
    type RazorpayOrder,
} from "./razorpay";
import { TEMPLATES } from "@/lib/templates";
import { templateUuid } from "@/lib/templates/template-id";
import type { StyleId } from "@/lib/ai/generate/styles";
import {
    ADVANCED_PACKAGE_PRICE_INR,
    GENERATION_PASS_PRICE_INR,
} from "@/lib/limits/config";
import { grantGenerationPasses, generationPassesRemaining } from "@/lib/ai/jobs/quota";
import type { AiPackageId } from "./packages";
import {
    attachReservedOrder,
    captureDiscount,
    releaseDiscountReservation,
    reserveDiscount,
    type PricedWithCode,
} from "./discount-codes";

// The gate at publish (R3 · Doc 22 P2/P3, Amendment A1).
//
// Opening a premium template or Pro look needs account Pro; signature templates and
// Premium looks need account Premium. That gate lives on createProject and generate/choose,
// not here. What this file still buys is a `publish` entitlement on one project. Two things
// decide it and both are read from the database rather than taken from the request: whether
// this project is the caller's, and what its design costs. A paywall the client is trusted
// to describe is not a paywall.

export interface CheckoutResponse {
    /** Nothing to pay — the entitlement is already granted and publish will go through. */
    granted: boolean;
    orderId?: string;
    amountInPaise?: number;
    currency?: "INR";
    keyId?: string;
    priceInr?: number;
    listPriceInr?: number;
    discountPercent?: number;
}

function checkoutFields(priced: PricedWithCode): Pick<CheckoutResponse, "priceInr" | "listPriceInr" | "discountPercent"> {
    return {
        priceInr: priced.priceInr,
        listPriceInr: priced.listPriceInr,
        ...(priced.discountPercent ? { discountPercent: priced.discountPercent } : {}),
    };
}

async function startDiscountedOrder(opts: {
    userId: string;
    kind: OrderKind;
    listPriceInr: number;
    receipt: string;
    notes: OrderNotes;
    discountCode?: string;
}): Promise<{ priced: PricedWithCode; order?: RazorpayOrder }> {
    let priced: PricedWithCode = { priceInr: opts.listPriceInr, listPriceInr: opts.listPriceInr };
    if (opts.discountCode) {
        priced = await reserveDiscount(opts.userId, opts.kind, opts.listPriceInr, opts.discountCode);
    }

    if (priced.priceInr === 0) {
        return { priced };
    }

    const notes: OrderNotes = priced.discountCode
        ? {
              ...opts.notes,
              discountCode: priced.discountCode,
              listPriceInr: String(priced.listPriceInr),
              paidInr: String(priced.priceInr),
          }
        : opts.notes;

    try {
        const order = await createOrder(inrToPaise(priced.priceInr), opts.receipt, notes);
        if (priced.discountCode && priced.exclusiveHold !== false) {
            await attachReservedOrder(priced.discountCode, order.id);
        }
        return { priced, order };
    } catch (error) {
        if (priced.discountCode && priced.exclusiveHold !== false) {
            await releaseDiscountReservation(priced.discountCode, opts.userId);
        }
        throw error;
    }
}

async function captureCodeIfUsed(
    priced: PricedWithCode,
    userId: string,
    kind: OrderKind,
    orderId?: string,
): Promise<void> {
    if (!priced.discountCode) return;
    await captureDiscount({
        code: priced.discountCode,
        userId,
        kind,
        orderId,
        listPriceInr: priced.listPriceInr,
        paidInr: priced.priceInr,
    });
}

interface ProjectForCheckout {
    tier: TemplateTier;
    sourceTemplateId: string | null;
}

/**
 * What this project's design costs, read through the caller's own client.
 *
 * A project belonging to someone else is invisible to RLS, so it reads as absent — which is
 * both the security answer (SEC-14) and the honest one.
 */
async function priceOf(
    supabase: SupabaseClient,
    projectId: string,
): Promise<ProjectForCheckout> {
    const { data, error } = await supabase
        .from("projects")
        .select("source_template_id, templates(tier)")
        .eq("id", projectId)
        .maybeSingle();

    if (error) throw new ApiError("internal", "Could not read the project.", error.message);
    if (!data) throw new ApiError("not_found", "That project does not exist.");

    // A generated project has no design behind it and nothing to charge for yet; the same is
    // true if the design has since been removed. Free is the safe direction to fail: it can
    // be corrected without having taken anyone's money.
    const joined = data.templates as { tier?: TemplateTier } | { tier?: TemplateTier }[] | null;
    const row = Array.isArray(joined) ? joined[0] : joined;

    return {
        tier: row?.tier ?? "free",
        sourceTemplateId: (data as { source_template_id?: string | null }).source_template_id ?? null,
    };
}

/**
 * Grant the publish entitlement. Server-side only, always.
 *
 * Written with the service role because the webhook has no session — Razorpay is not signed
 * in as anybody — and because `entitlements` is deliberately closed to clients. The unique
 * index on (project_id, kind) makes this idempotent: a webhook delivered twice, or a retry
 * after a timeout, grants once.
 */
export async function grantPublish(
    projectId: string,
    userId: string,
    source: "paid" | "launch_offer",
): Promise<void> {
    const admin = supabaseAdmin();

    const { error } = await admin.from("entitlements").insert({
        user_id: userId,
        project_id: projectId,
        kind: "publish",
        source,
        status: "active",
    });

    if (!error) return;

    // 23505 on the (project_id, kind) index: already unlocked. A webhook delivered twice, a
    // Razorpay retry, or a second checkout for a project that was already paid for all land
    // here, and all of them mean the same thing — the person can publish. Not an error.
    //
    // Insert rather than upsert deliberately: that index is partial (`where project_id is
    // not null`), and ON CONFLICT cannot always infer a partial index, so an upsert would
    // fail on the real database while passing against any fake.
    if (error.code === "23505") return;

    throw new ApiError("internal", "Could not unlock publishing.", error.message);
}

/**
 * Grant edit_unlock so a live site can be changed and republished (same address).
 */
export async function grantEditUnlock(
    projectId: string,
    userId: string,
    source: "paid" | "launch_offer" = "paid",
): Promise<void> {
    const admin = supabaseAdmin();

    const { error } = await admin.from("entitlements").insert({
        user_id: userId,
        project_id: projectId,
        kind: "edit_unlock",
        source,
        status: "active",
    });

    if (!error) return;
    if (error.code === "23505") return;

    throw new ApiError("internal", "Could not unlock editing.", error.message);
}

/**
 * Start paying to publish, or discover there is nothing to pay.
 *
 * A free design is granted on the spot: making somebody open a checkout for Rs 0 is a
 * worse experience and an extra way to fail. A paid one gets a Razorpay order, and the
 * entitlement waits for the webhook — never for the browser's word that it went through.
 */
export async function startPublishCheckout(
    supabase: SupabaseClient,
    userId: string,
    projectId: string,
    discountCode?: string,
): Promise<CheckoutResponse> {
    // Owner-scoped read first, before the entitlement is consulted (R3 D19 route audit).
    //
    // These two lines were the other way round, and the order mattered. checkEntitlement
    // asks about the *account*, not the project, and a `pro` subscription satisfies every
    // kind — so a subscriber asking about somebody else's project got `granted: true` and
    // returned before anything read the project row. Every other route on a project answers
    // not_found for one that is not yours; this one answered 200.
    //
    // Never exploitable: nothing was granted, nothing was charged, and the answer was
    // identical for an id belonging to nobody, so it leaked nothing either. It was the API
    // disagreeing with itself about what a stranger is told, which is exactly what an audit
    // is for and exactly what nobody finds by reading one route at a time.
    const { tier, sourceTemplateId } = await priceOf(supabase, projectId);

    const existing = await checkEntitlement(supabase, userId, projectId, "publish");
    if (existing.granted) return { granted: true };

    if (sourceTemplateId && (await hasTemplateAccess(supabase, userId, sourceTemplateId, tier))) {
        await grantPublish(projectId, userId, "paid");
        return { granted: true };
    }

    if (isFree(tier)) {
        await grantPublish(projectId, userId, "launch_offer");
        return { granted: true };
    }

    const priceInr = publishPriceInr(tier);
    const { priced, order } = await startDiscountedOrder({
        userId,
        kind: "publish",
        listPriceInr: priceInr,
        receipt: `pub_${projectId.slice(0, 8)}_${Date.now()}`,
        notes: { projectId, userId, kind: "publish" },
        discountCode,
    });

    if (!order) {
        await grantPublish(projectId, userId, "launch_offer");
        await captureCodeIfUsed(priced, userId, "publish");
        return { granted: true, ...checkoutFields(priced) };
    }

    return {
        granted: false,
        orderId: order.id,
        amountInPaise: order.amount,
        currency: "INR",
        keyId: publishableKeyId(),
        ...checkoutFields(priced),
    };
}

/**
 * Pay Rs 249 to reopen editing on a published site (and republish to the same address).
 */
export async function startEditUnlockCheckout(
    supabase: SupabaseClient,
    userId: string,
    projectId: string,
    discountCode?: string,
): Promise<CheckoutResponse> {
    // Owner check — same pattern as publish checkout.
    await priceOf(supabase, projectId);

    const permission = await checkEntitlement(supabase, userId, projectId, "edit_unlock");
    if (permission.granted) return { granted: true };

    const pro = await checkEntitlement(supabase, userId, null, "pro");
    if (pro.granted) {
        await grantEditUnlock(projectId, userId, "paid");
        return { granted: true };
    }

    if (!paymentsConfigured()) {
        throw new ApiError(
            "service_unavailable",
            "Payments are not available right now. Try again in a little while.",
        );
    }

    const { priced, order } = await startDiscountedOrder({
        userId,
        kind: "edit_unlock",
        listPriceInr: EDIT_UNLOCK_PRICE_INR,
        receipt: `edit_${projectId.slice(0, 8)}_${Date.now()}`,
        notes: { projectId, userId, kind: "edit_unlock" },
        discountCode,
    });

    if (!order) {
        await grantEditUnlock(projectId, userId, "launch_offer");
        await captureCodeIfUsed(priced, userId, "edit_unlock");
        return { granted: true, ...checkoutFields(priced) };
    }

    return {
        granted: false,
        orderId: order.id,
        amountInPaise: order.amount,
        currency: "INR",
        keyId: publishableKeyId(),
        ...checkoutFields(priced),
    };
}

/**
 * Grant a per-user plan. Server-side only.
 *
 * One row per user per kind. A second payment, a webhook retry, or a return after they
 * switched to Starter all land here — insert once, and if that row already exists, turn it
 * back to active rather than inventing a second grant.
 */
async function grantAccountKind(userId: string, kind: "pro" | "premium"): Promise<void> {
    const admin = supabaseAdmin();
    const label = kind === "premium" ? "Premium" : "Pro";

    const existing = await admin
        .from("entitlements")
        .select("id, status")
        .eq("user_id", userId)
        .eq("kind", kind)
        .maybeSingle();

    if (existing.error) {
        throw new ApiError("internal", `Could not unlock ${label}.`, existing.error.message);
    }

    if (existing.data) {
        if (existing.data.status === "active") return;

        const { error } = await admin
            .from("entitlements")
            .update({
                status: "active",
                source: "paid",
                granted_at: new Date().toISOString(),
            })
            .eq("id", existing.data.id);

        if (error) throw new ApiError("internal", `Could not unlock ${label}.`, error.message);
        return;
    }

    const { error } = await admin.from("entitlements").insert({
        user_id: userId,
        project_id: null,
        kind,
        source: "paid",
        status: "active",
    });

    if (!error) return;
    if (error.code === "23505") return;

    throw new ApiError("internal", `Could not unlock ${label}.`, error.message);
}

export async function grantPro(userId: string): Promise<void> {
    await grantAccountKind(userId, "pro");
}

export async function grantPremium(userId: string): Promise<void> {
    await grantAccountKind(userId, "premium");
}

/**
 * Unlock whatever the order notes say — used by the webhook and by checkout verify.
 *
 * Verify used to only check the signature and wait for the webhook. When the session
 * expired during Razorpay, or the webhook was late/missing, people paid and stayed on
 * Starter. Granting here (idempotent) closes that gap; the webhook remains the backup.
 */
export async function grantFromOrderNotes(notes: Partial<OrderNotes>): Promise<{
    kind: OrderNotes["kind"];
    userId: string;
}> {
    const userId = typeof notes.userId === "string" ? notes.userId.trim() : "";
    const kind = typeof notes.kind === "string" ? notes.kind.trim() : "";

    if (!userId) {
        throw new ApiError("validation_failed", "That payment has no account on it.");
    }

    if (kind === "pro") {
        await grantPro(userId);
        return { kind, userId };
    }
    if (kind === "premium") {
        await grantPremium(userId);
        return { kind, userId };
    }
    if (kind === "advanced") {
        await grantAdvanced(userId);
        return { kind, userId };
    }
    if (kind === "generation_pass") {
        await grantGenerationPassPurchase(userId);
        return { kind, userId };
    }
    if (kind === "template") {
        const templateId = typeof notes.templateId === "string" ? notes.templateId.trim() : "";
        if (!templateId) {
            throw new ApiError("validation_failed", "That payment has no design on it.");
        }
        await grantTemplate(userId, templateId);
        return { kind, userId };
    }
    if (kind === "style") {
        const styleId = typeof notes.styleId === "string" ? notes.styleId.trim() : "";
        if (!styleId) {
            throw new ApiError("validation_failed", "That payment has no look on it.");
        }
        await grantStyle(userId, styleId);
        return { kind, userId };
    }
    if (kind === "publish") {
        const projectId = typeof notes.projectId === "string" ? notes.projectId.trim() : "";
        if (!projectId) {
            throw new ApiError("validation_failed", "That payment has no site on it.");
        }
        await grantPublish(projectId, userId, "paid");
        return { kind, userId };
    }
    if (kind === "edit_unlock") {
        const projectId = typeof notes.projectId === "string" ? notes.projectId.trim() : "";
        if (!projectId) {
            throw new ApiError("validation_failed", "That payment has no site on it.");
        }
        await grantEditUnlock(projectId, userId, "paid");
        return { kind, userId };
    }

    throw new ApiError("validation_failed", "That payment is not for a plan we recognise.");
}

/**
 * After Razorpay checkout: prove the payment tokens, read our notes off the order, grant.
 * Does not need a browser session — the signature is the trust.
 */
export async function applyVerifiedCheckout(input: {
    orderId: string;
    paymentId: string;
    signature: string;
}): Promise<{ kind: OrderNotes["kind"]; userId: string }> {
    const valid = verifyPaymentSignature(input.orderId, input.paymentId, input.signature);
    if (!valid) {
        throw new ApiError(
            "validation_failed",
            "Payment verification failed. Please contact support if you were charged.",
        );
    }

    const order = await fetchOrder(input.orderId);
    return grantFromOrderNotes(order.notes);
}

/**
 * Recover a paid order for the signed-in account when the webhook never landed.
 * Order id comes from the Razorpay receipt / dashboard.
 */
export async function recoverPaidOrder(
    userId: string,
    orderId: string,
): Promise<{ kind: OrderNotes["kind"] }> {
    const order = await fetchOrder(orderId.trim());
    const notesUser = typeof order.notes.userId === "string" ? order.notes.userId.trim() : "";

    if (!notesUser || notesUser !== userId) {
        throw new ApiError(
            "forbidden",
            "That payment belongs to a different account.",
        );
    }

    const paid = await orderHasCapturedPayment(order.id);
    if (!paid && order.status !== "paid") {
        throw new ApiError(
            "validation_failed",
            "Razorpay does not show that order as paid yet.",
        );
    }

    const granted = await grantFromOrderNotes(order.notes);
    return { kind: granted.kind };
}

/** Grant the Advanced AI usage package (not a catalogue design unlock). */
export async function grantAdvanced(userId: string): Promise<void> {
    const admin = supabaseAdmin();

    const existing = await admin
        .from("entitlements")
        .select("id, status")
        .eq("user_id", userId)
        .eq("kind", "advanced")
        .maybeSingle();

    if (existing.error) {
        throw new ApiError("internal", "Could not unlock Advanced.", existing.error.message);
    }

    if (existing.data) {
        if (existing.data.status === "active") return;
        const { error } = await admin
            .from("entitlements")
            .update({
                status: "active",
                source: "paid",
                granted_at: new Date().toISOString(),
            })
            .eq("id", existing.data.id);
        if (error) throw new ApiError("internal", "Could not unlock Advanced.", error.message);
        return;
    }

    const { error } = await admin.from("entitlements").insert({
        user_id: userId,
        project_id: null,
        kind: "advanced",
        source: "paid",
        status: "active",
    });

    if (!error) return;
    if (error.code === "23505") return;
    throw new ApiError("internal", "Could not unlock Advanced.", error.message);
}

async function grantItem(
    userId: string,
    kind: "template" | "style",
    extra: { template_id: string } | { style_id: string },
    label: string,
): Promise<void> {
    const admin = supabaseAdmin();
    const match =
        "template_id" in extra
            ? admin.from("entitlements").select("id, status").eq("user_id", userId).eq("kind", "template").eq("template_id", extra.template_id)
            : admin.from("entitlements").select("id, status").eq("user_id", userId).eq("kind", "style").eq("style_id", extra.style_id);

    const existing = await match.maybeSingle();

    if (existing.error) {
        throw new ApiError("internal", `Could not unlock ${label}.`, existing.error.message);
    }

    if (existing.data) {
        if (existing.data.status === "active") return;
        const { error } = await admin
            .from("entitlements")
            .update({
                status: "active",
                source: "paid",
                granted_at: new Date().toISOString(),
            })
            .eq("id", existing.data.id);
        if (error) throw new ApiError("internal", `Could not unlock ${label}.`, error.message);
        return;
    }

    const { error } = await admin.from("entitlements").insert({
        user_id: userId,
        project_id: null,
        kind,
        source: "paid",
        status: "active",
        ...extra,
    });

    if (!error) return;
    if (error.code === "23505") return;
    throw new ApiError("internal", `Could not unlock ${label}.`, error.message);
}

export async function grantTemplate(userId: string, templateId: string): Promise<void> {
    await grantItem(userId, "template", { template_id: templateId }, "this design");
}

export async function grantStyle(userId: string, styleId: string): Promise<void> {
    await grantItem(userId, "style", { style_id: styleId }, "this look");
}

function resolveDesign(id: string) {
    const bySlug = TEMPLATES.find((template) => template.id === id);
    if (bySlug) return { uuid: templateUuid(bySlug.id), design: bySlug };
    const byUuid = TEMPLATES.find((template) => templateUuid(template.id) === id);
    if (byUuid) return { uuid: templateUuid(byUuid.id), design: byUuid };
    return null;
}

export async function startTemplateCheckout(
    supabase: SupabaseClient,
    userId: string,
    templateRef: string,
    discountCode?: string,
): Promise<CheckoutResponse> {
    const resolved = resolveDesign(templateRef);
    const need = resolved ? requiredPlanForTemplate(resolved.design.tier) : null;
    if (!resolved || !need) {
        throw new ApiError("not_found", "That design does not exist.");
    }

    // Plans unlock the whole tier — never sell a single template anymore.
    return startPlanCheckout(supabase, userId, need, discountCode);
}

const PAID_STYLES = new Set<StyleId>(["photos", "motion"]);

export async function startStyleCheckout(
    supabase: SupabaseClient,
    userId: string,
    styleId: string,
    discountCode?: string,
): Promise<CheckoutResponse> {
    if (!PAID_STYLES.has(styleId as StyleId)) {
        throw new ApiError("not_found", "That look does not exist.");
    }

    const need = requiredPlanForStyle(
        styleId === "photos" ? "pro" : styleId === "motion" ? "premium" : null,
    );
    if (!need) throw new ApiError("not_found", "That look does not exist.");

    // Same as designs: upgrade the account plan, not a one-off look SKU.
    return startPlanCheckout(supabase, userId, need, discountCode);
}

/** Stop paid plans on this account. Does not refund, and does not touch published sites. */
export async function revokePro(userId: string): Promise<void> {
    const admin = supabaseAdmin();

    const { error } = await admin
        .from("entitlements")
        .update({ status: "revoked" })
        .eq("user_id", userId)
        .in("kind", ["pro", "premium"])
        .eq("status", "active");

    if (error) throw new ApiError("internal", "Could not switch to Starter.", error.message);
}

function isLivePlanRow(row: { status: string; expires_at?: string | null }, now: number): boolean {
    if (row.status !== "active") return false;
    if (!row.expires_at) return true;
    const expiry = Date.parse(row.expires_at);
    return Number.isFinite(expiry) && expiry > now;
}

function currentPlanFromRows(
    rows: { kind: string; status: string; expires_at?: string | null }[],
): AccountPlan {
    const now = Date.now();
    const live = rows.filter((row) => isLivePlanRow(row, now));
    if (live.some((row) => row.kind === "premium")) return "premium";
    if (live.some((row) => row.kind === "pro")) return "pro";
    return "starter";
}

function expandUnlocks(
    rows: {
        kind: string;
        status: string;
        expires_at?: string | null;
        template_id?: string | null;
        style_id?: string | null;
    }[],
    plan: AccountPlan,
): { templateIds: string[]; styleIds: string[] } {
    const now = Date.now();
    const live = rows.filter((row) => isLivePlanRow(row, now));
    const templateIds = new Set<string>();
    const styleIds = new Set<string>();

    for (const row of live) {
        if (row.kind === "template" && row.template_id) templateIds.add(row.template_id);
        if (row.kind === "style" && row.style_id) styleIds.add(row.style_id);
    }

    if (plan === "premium") {
        for (const design of TEMPLATES) {
            if (design.tier !== "free") templateIds.add(templateUuid(design.id));
        }
        styleIds.add("photos");
        styleIds.add("motion");
    } else if (plan === "pro") {
        for (const design of TEMPLATES) {
            if (design.tier === "premium") templateIds.add(templateUuid(design.id));
        }
        styleIds.add("photos");
    }

    return { templateIds: [...templateIds], styleIds: [...styleIds] };
}

/**
 * Start paying for Pro or Premium, or discover they already hold it (or a higher plan).
 */
function devPlanGrantEnabled(): boolean {
    return process.env.PAGECRAFTS_DEV_GRANT_PLANS === "true";
}

export async function startPlanCheckout(
    supabase: SupabaseClient,
    userId: string,
    plan: "pro" | "premium",
    discountCode?: string,
): Promise<CheckoutResponse> {
    if (plan !== "pro" && plan !== "premium") {
        throw new ApiError("validation_failed", "That plan cannot be purchased.");
    }

    const billing = await getBilling(supabase, userId);
    if (plan === "pro" && (billing.plan === "pro" || billing.plan === "premium")) {
        return { granted: true };
    }
    if (plan === "premium" && billing.plan === "premium") return { granted: true };

    const listPriceInr = plan === "premium" ? PREMIUM_PRICE_INR : PRO_PRICE_INR;

    try {
        const { priced, order } = await startDiscountedOrder({
            userId,
            kind: plan,
            listPriceInr,
            receipt: `${plan}_${userId.slice(0, 8)}_${Date.now()}`,
            notes: { userId, kind: plan },
            discountCode,
        });

        if (!order) {
            if (plan === "premium") await grantPremium(userId);
            else await grantPro(userId);
            await captureCodeIfUsed(priced, userId, plan);
            return { granted: true, ...checkoutFields(priced) };
        }

        return {
            granted: false,
            orderId: order.id,
            amountInPaise: order.amount,
            currency: "INR",
            keyId: publishableKeyId(),
            ...checkoutFields(priced),
        };
    } catch (error) {
        if (
            error instanceof ApiError &&
            error.code === "payments_unavailable" &&
            devPlanGrantEnabled()
        ) {
            if (plan === "premium") await grantPremium(userId);
            else await grantPro(userId);
            return { granted: true };
        }
        throw error;
    }
}

export async function startProCheckout(
    supabase: SupabaseClient,
    userId: string,
): Promise<CheckoutResponse> {
    return startPlanCheckout(supabase, userId, "pro");
}

/** Buy the Advanced AI package (Rs 699) — raises per-site generation limit to 30. */
export async function startAdvancedCheckout(
    supabase: SupabaseClient,
    userId: string,
    discountCode?: string,
): Promise<CheckoutResponse> {
    const { data, error } = await supabase
        .from("entitlements")
        .select("id, status, expires_at")
        .eq("user_id", userId)
        .eq("kind", "advanced")
        .maybeSingle();

    if (error) throw new ApiError("internal", "Could not read your AI package.", error.message);
    if (data && isLivePlanRow(data, Date.now())) return { granted: true };

    const { priced, order } = await startDiscountedOrder({
        userId,
        kind: "advanced",
        listPriceInr: ADVANCED_PACKAGE_PRICE_INR,
        receipt: `adv_${userId.slice(0, 8)}_${Date.now()}`,
        notes: { userId, kind: "advanced" },
        discountCode,
    });

    if (!order) {
        await grantAdvanced(userId);
        await captureCodeIfUsed(priced, userId, "advanced");
        return { granted: true, ...checkoutFields(priced) };
    }

    return {
        granted: false,
        orderId: order.id,
        amountInPaise: order.amount,
        currency: "INR",
        keyId: publishableKeyId(),
        ...checkoutFields(priced),
    };
}

/** Buy one extra AI generation round (Rs 199) after the package allowance is used. */
export async function startGenerationPassCheckout(
    userId: string,
    discountCode?: string,
): Promise<CheckoutResponse> {
    const { priced, order } = await startDiscountedOrder({
        userId,
        kind: "generation_pass",
        listPriceInr: GENERATION_PASS_PRICE_INR,
        receipt: `genpass_${userId.slice(0, 8)}_${Date.now()}`,
        notes: { userId, kind: "generation_pass" },
        discountCode,
    });

    if (!order) {
        await grantGenerationPassPurchase(userId);
        await captureCodeIfUsed(priced, userId, "generation_pass");
        return { granted: true, ...checkoutFields(priced) };
    }

    return {
        granted: false,
        orderId: order.id,
        amountInPaise: order.amount,
        currency: "INR",
        keyId: publishableKeyId(),
        ...checkoutFields(priced),
    };
}

export async function grantGenerationPassPurchase(userId: string): Promise<void> {
    await grantGenerationPasses(userId, 1);
}

const ORDER_KINDS = new Set<OrderNotes["kind"]>([
    "publish",
    "pro",
    "premium",
    "template",
    "style",
    "advanced",
    "generation_pass",
]);

/**
 * Apply a paid order's notes: unlock the plan, design, look, package, or publish row.
 *
 * Used by both the checkout verify route (after HMAC of order|payment) and the
 * webhook (after HMAC of the raw body). Grants are idempotent — a second call for
 * the same payment is a no-op, never a downgrade.
 *
 * When `requireUserId` is set (browser verify), notes.userId must match the signed-in
 * person so one account cannot claim another account's order.
 */
export async function fulfillPaidNotes(
    notes: Partial<OrderNotes>,
    meta: { paymentId: string; orderId: string },
    options?: { requireUserId?: string },
): Promise<{ kind: OrderNotes["kind"] }> {
    const { userId, kind, projectId, templateId, styleId } = notes;

    if (!userId || !kind || !ORDER_KINDS.has(kind as OrderNotes["kind"])) {
        console.error("[payments] captured payment carries no usable notes", {
            paymentId: meta.paymentId,
            orderId: meta.orderId,
        });
        throw new ApiError(
            "validation_failed",
            "This payment could not be matched to a purchase. Please contact support if you were charged.",
        );
    }

    const resolvedKind = kind as OrderNotes["kind"];

    const finish = async () => {
        if (notes.discountCode) {
            await captureDiscount({
                code: notes.discountCode,
                userId,
                kind: resolvedKind,
                orderId: meta.orderId,
                listPriceInr: Number(notes.listPriceInr) || 0,
                paidInr: Number(notes.paidInr) || 0,
            });
        }
        return { kind: resolvedKind };
    };

    if (options?.requireUserId && options.requireUserId !== userId) {
        console.error("[payments] verified payment user mismatch", {
            paymentId: meta.paymentId,
            orderId: meta.orderId,
            expectedUserId: options.requireUserId,
        });
        throw new ApiError(
            "forbidden",
            "This payment belongs to a different account.",
        );
    }

    if (resolvedKind === "advanced") {
        await grantAdvanced(userId);
        console.info("[payments] Advanced unlocked", { userId, paymentId: meta.paymentId });
        return finish();
    }

    if (resolvedKind === "generation_pass") {
        await grantGenerationPassPurchase(userId);
        console.info("[payments] generation pass granted", { userId, paymentId: meta.paymentId });
        return finish();
    }

    if (resolvedKind === "template") {
        if (!templateId) {
            console.error("[payments] captured template payment carries no design", meta);
            throw new ApiError(
                "validation_failed",
                "This payment could not be matched to a design. Please contact support if you were charged.",
            );
        }
        await grantTemplate(userId, templateId);
        console.info("[payments] template unlocked", {
            userId,
            templateId,
            paymentId: meta.paymentId,
        });
        return finish();
    }

    if (resolvedKind === "style") {
        if (!styleId) {
            console.error("[payments] captured look payment carries no style", meta);
            throw new ApiError(
                "validation_failed",
                "This payment could not be matched to a look. Please contact support if you were charged.",
            );
        }
        await grantStyle(userId, styleId);
        console.info("[payments] look unlocked", { userId, styleId, paymentId: meta.paymentId });
        return finish();
    }

    if (resolvedKind === "pro" || resolvedKind === "premium") {
        if (resolvedKind === "premium") await grantPremium(userId);
        else await grantPro(userId);
        const label = resolvedKind === "premium" ? "Premium" : "Pro";
        console.info(`[payments] ${label} unlocked`, { userId, paymentId: meta.paymentId });
        return finish();
    }

    if (!projectId) {
        console.error("[payments] captured publish payment carries no project", meta);
        throw new ApiError(
            "validation_failed",
            "This payment could not be matched to a site. Please contact support if you were charged.",
        );
    }

    await grantPublish(projectId, userId, "paid");
    console.info("[payments] publish unlocked", { projectId, paymentId: meta.paymentId });
    return finish();
}

/** What Settings and /plans show: the live plan, whether checkout can open, and every grant. */
export async function getBilling(
    supabase: SupabaseClient,
    userId: string,
): Promise<BillingSummary> {
    const { data, error } = await supabase
        .from("entitlements")
        .select("id, kind, source, status, granted_at, expires_at, project_id, template_id, style_id")
        .eq("user_id", userId)
        .order("granted_at", { ascending: false });

    if (error) throw new ApiError("internal", "Could not read billing.", error.message);

    const rows = data ?? [];
    const plan = currentPlanFromRows(rows as { kind: string; status: string; expires_at?: string | null }[]);
    const unlocked = expandUnlocks(
        rows as { kind: string; status: string; expires_at?: string | null; template_id?: string | null; style_id?: string | null }[],
        plan,
    );
    const now = Date.now();
    const aiPackage: AiPackageId = rows.some(
        (row) =>
            (row as { kind: string }).kind === "advanced" &&
            isLivePlanRow(row as { status: string; expires_at?: string | null }, now),
    )
        ? "advanced"
        : "free";
    const generationPasses = await generationPassesRemaining(userId);

    return {
        plan,
        paymentsReady: paymentsConfigured(),
        proPriceInr: PRO_PRICE_INR,
        premiumPriceInr: PREMIUM_PRICE_INR,
        advancedPriceInr: ADVANCED_PACKAGE_PRICE_INR,
        generationPassPriceInr: GENERATION_PASS_PRICE_INR,
        aiPackage,
        generationPasses,
        unlockedTemplateIds: unlocked.templateIds,
        unlockedStyleIds: unlocked.styleIds,
        history: rows.map((row) => {
            const item = row as {
                id: string;
                kind: BillingSummary["history"][number]["kind"];
                source: BillingSummary["history"][number]["source"];
                status: BillingSummary["history"][number]["status"];
                granted_at: string;
                project_id: string | null;
            };
            return {
                id: String(item.id),
                kind: item.kind,
                source: item.source,
                status: item.status,
                grantedAt: String(item.granted_at),
                projectId: item.project_id ?? null,
            };
        }),
    };
}
