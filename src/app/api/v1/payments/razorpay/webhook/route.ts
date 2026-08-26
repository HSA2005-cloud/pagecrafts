import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { fulfillPaidNotes } from "@/lib/payments/checkout";
import { ApiError } from "@/lib/errors/respond";
import { capturedPayment, verifyWebhook } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/payments/razorpay/webhook — second, idempotent grant path after payment.
//
// Not withRoute: this caller is Razorpay, not a signed-in person, so there is no session to
// require and no envelope worth returning. What replaces authentication is the signature —
// an HMAC of the exact bytes below, which only someone holding the webhook secret can
// produce.
//
// Browser verify also grants after a signature check. Both paths call fulfillPaidNotes,
// which is idempotent — a webhook retry after verify (or the reverse) is safe.
export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verifyWebhook(raw, req.headers.get("x-razorpay-signature"))) {
    console.error("[payments] webhook signature did not verify");
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const payment = capturedPayment(body);

  // Razorpay sends every event type to one URL. Anything that is not a captured payment is
  // acknowledged and ignored — returning an error would make it retry an event forever.
  if (!payment) return NextResponse.json({ ok: true, ignored: true });

  try {
    const granted = await fulfillPaidNotes(payment.notes, {
      paymentId: payment.paymentId,
      orderId: payment.orderId,
    });
    console.info(`[payments] ${granted.kind} unlocked`, {
      paymentId: payment.paymentId,
      orderId: payment.orderId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ApiError && error.code === "validation_failed") {
      console.error("[payments] captured payment carries no usable notes", {
        paymentId: payment.paymentId,
        orderId: payment.orderId,
        reason: error.message,
      });
      return NextResponse.json({ ok: true, ignored: true });
    }

    console.error("[payments] could not grant after payment", {
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
