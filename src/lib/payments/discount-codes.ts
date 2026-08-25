import "server-only";

import { ApiError } from "@/lib/errors/respond";
import { supabaseAdmin } from "@/lib/data/supabase-admin";
import type { OrderKind } from "./razorpay";
import {
    applyPercentOff,
    codeAppliesTo,
    normalizeScratchCode,
    unwrapDiscountRpcRow,
    type DiscountAppliesTo,
} from "./discount-math";

interface DiscountCodeRow {
    id: string;
    code: string;
    percent_off: number;
    applies_to: DiscountAppliesTo;
    max_redemptions: number;
    redeemed_count: number;
    reserved_by: string | null;
    reserved_order_id: string | null;
    reserved_at: string | null;
    expires_at: string | null;
    disabled_at: string | null;
}

const DISCOUNT_COLUMNS =
    "id, code, percent_off, applies_to, max_redemptions, redeemed_count, reserved_by, reserved_order_id, reserved_at, expires_at, disabled_at";

export interface PricedWithCode {
    priceInr: number;
    listPriceInr: number;
    discountPercent?: number;
    discountCode?: string;
}

function invalidCode(): never {
    throw new ApiError(
        "invalid_discount",
        "That scratch-card code is not valid, has expired, or has already been used.",
    );
}

function pricedFrom(row: DiscountCodeRow, listPriceInr: number): PricedWithCode {
    return {
        priceInr: applyPercentOff(listPriceInr, row.percent_off),
        listPriceInr,
        discountPercent: row.percent_off,
        discountCode: row.code,
    };
}

function rowIsHoldable(row: DiscountCodeRow, userId: string, now = Date.now()): boolean {
    if (row.disabled_at) return false;
    if (row.expires_at && Date.parse(row.expires_at) <= now) return false;
    if (row.redeemed_count >= row.max_redemptions) return false;
    if (
        row.reserved_by &&
        row.reserved_at &&
        now - Date.parse(row.reserved_at) < 30 * 60 * 1000 &&
        row.reserved_by !== userId
    ) {
        return false;
    }
    return true;
}

export async function previewDiscount(
    userId: string,
    kind: OrderKind,
    listPriceInr: number,
    rawCode: string,
): Promise<PricedWithCode> {
    const code = normalizeScratchCode(rawCode);
    if (!code) invalidCode();

    const { data, error } = await supabaseAdmin()
        .from("discount_codes")
        .select(DISCOUNT_COLUMNS)
        .eq("code", code)
        .maybeSingle();

    if (error) {
        console.error("[payments] could not read scratch-card", error.message);
        invalidCode();
    }
    if (!data) invalidCode();

    const row = data as DiscountCodeRow;
    if (!rowIsHoldable(row, userId)) invalidCode();
    if (!codeAppliesTo(row.applies_to, kind)) invalidCode();

    return pricedFrom(row, listPriceInr);
}

/**
 * Hold the card in a single UPDATE so a second checkout cannot take it.
 * Used when PostgREST has not yet exposed `reserve_discount_code` (schema cache).
 */
async function reserveDiscountViaTable(
    userId: string,
    code: string,
): Promise<DiscountCodeRow | null> {
    const admin = supabaseAdmin();
    const { data, error } = await admin
        .from("discount_codes")
        .select(DISCOUNT_COLUMNS)
        .eq("code", code)
        .maybeSingle();

    if (error) {
        console.error("[payments] could not read scratch-card for hold", error.message);
        return null;
    }
    if (!data) return null;

    const row = data as DiscountCodeRow;
    if (!rowIsHoldable(row, userId)) return null;

    const takeFrom = row.reserved_by && row.reserved_by !== userId ? row.reserved_by : null;
    const ownerFilter = takeFrom
        ? `reserved_by.is.null,reserved_by.eq.${userId},reserved_by.eq.${takeFrom}`
        : `reserved_by.is.null,reserved_by.eq.${userId}`;

    const { data: held, error: holdError } = await admin
        .from("discount_codes")
        .update({
            reserved_by: userId,
            reserved_at: new Date().toISOString(),
            reserved_order_id: null,
        })
        .eq("id", row.id)
        .eq("redeemed_count", row.redeemed_count)
        .is("disabled_at", null)
        .or(ownerFilter)
        .select(DISCOUNT_COLUMNS)
        .maybeSingle();

    if (holdError) {
        console.error("[payments] could not hold scratch-card", holdError.message);
        return null;
    }

    return (held as DiscountCodeRow | null) ?? null;
}

/**
 * Hold the card for this checkout so a second person cannot start paying with the same code.
 * Released if Razorpay order creation fails; captured when payment (or a 100% grant) lands.
 */
export async function reserveDiscount(
    userId: string,
    kind: OrderKind,
    listPriceInr: number,
    rawCode: string,
): Promise<PricedWithCode> {
    const code = normalizeScratchCode(rawCode);
    if (!code) invalidCode();

    const { data, error } = await supabaseAdmin().rpc("reserve_discount_code", {
        p_code: code,
        p_user_id: userId,
    });

    let row = error ? null : unwrapDiscountRpcRow<DiscountCodeRow>(data);
    if (!row) {
        if (error) console.error("[payments] reserve_discount_code", error.message);
        row = await reserveDiscountViaTable(userId, code);
    }

    if (!row) invalidCode();
    if (!codeAppliesTo(row.applies_to, kind)) {
        await releaseDiscountReservation(code, userId);
        invalidCode();
    }

    return pricedFrom(row, listPriceInr);
}

export async function attachReservedOrder(code: string, orderId: string): Promise<void> {
    const { error } = await supabaseAdmin()
        .from("discount_codes")
        .update({ reserved_order_id: orderId })
        .eq("code", code);

    if (error) {
        console.error("[payments] could not attach that payment to the code", {
            code,
            orderId,
            reason: error.message,
        });
    }
}

export async function releaseDiscountReservation(code: string, userId: string): Promise<void> {
    const { error } = await supabaseAdmin()
        .from("discount_codes")
        .update({
            reserved_by: null,
            reserved_at: null,
            reserved_order_id: null,
        })
        .eq("code", code)
        .eq("reserved_by", userId);

    if (error) {
        console.error("[payments] could not release scratch-card reservation", {
            code,
            reason: error.message,
        });
    }
}

async function captureDiscountViaTable(opts: {
    code: string;
    userId: string;
    kind: OrderKind;
    orderId?: string;
    listPriceInr: number;
    paidInr: number;
}): Promise<boolean> {
    const admin = supabaseAdmin();
    const { data, error } = await admin
        .from("discount_codes")
        .select(DISCOUNT_COLUMNS)
        .eq("code", opts.code)
        .maybeSingle();

    if (error) {
        console.error("[payments] could not read scratch-card for capture", error.message);
        return false;
    }
    if (!data) return false;

    const row = data as DiscountCodeRow;
    if (row.redeemed_count >= row.max_redemptions) return false;

    const { data: updated, error: updateError } = await admin
        .from("discount_codes")
        .update({
            redeemed_count: row.redeemed_count + 1,
            reserved_by: null,
            reserved_at: null,
            reserved_order_id: null,
        })
        .eq("id", row.id)
        .eq("redeemed_count", row.redeemed_count)
        .select("id")
        .maybeSingle();

    if (updateError || !updated) return false;

    const { error: insertError } = await admin.from("discount_redemptions").insert({
        code_id: row.id,
        user_id: opts.userId,
        order_id: opts.orderId ?? null,
        checkout_kind: opts.kind,
        list_price_inr: opts.listPriceInr,
        paid_inr: opts.paidInr,
    });

    if (insertError) {
        console.error("[payments] could not record scratch-card redemption", insertError.message);
    }

    return true;
}

export async function captureDiscount(opts: {
    code: string;
    userId: string;
    kind: OrderKind;
    orderId?: string;
    listPriceInr: number;
    paidInr: number;
}): Promise<void> {
    const code = normalizeScratchCode(opts.code);
    if (!code) return;

    const { data, error } = await supabaseAdmin().rpc("capture_discount_code", {
        p_code: code,
        p_user_id: opts.userId,
        p_order_id: opts.orderId ?? null,
        p_kind: opts.kind,
        p_list_price_inr: opts.listPriceInr,
        p_paid_inr: opts.paidInr,
    });

    if (error) {
        console.error("[payments] capture_discount_code", error.message);
        const captured = await captureDiscountViaTable({ ...opts, code });
        if (!captured) {
            console.info("[payments] scratch-card already captured", {
                code,
                orderId: opts.orderId,
            });
        }
        return;
    }

    if (!data) {
        console.info("[payments] scratch-card already captured", { code, orderId: opts.orderId });
    }
}
