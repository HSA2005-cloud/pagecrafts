import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { capturedPayment, verifyWebhook } from "@/lib/payments/razorpay";
import { grantAdvanced, grantGenerationPassPurchase, grantPremium, grantPro, grantPublish, grantStyle, grantTemplate } from "@/lib/payments/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/payments/razorpay/webhook — the only thing that grants a paid entitlement.
//
// Not withRoute: this caller is Razorpay, not a signed-in person, so there is no session to
// require and no envelope worth returning. What replaces authentication is the signature —
// an HMAC of the exact bytes below, which only someone holding the webhook secret can
// produce.
//
// The body is read as text and checked before it is parsed. Parsing and re-serialising
// changes the bytes and the signature would never match again.
//
// Status codes here are addressed to Razorpay, not to a user:
//   400 — the signature is wrong. Do not retry; something is misconfigured or hostile.
//   200 — handled, or not ours to handle. Either way, stop resending.
//   500 — we failed. Please retry; the grant is idempotent, so a repeat is safe.
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

  const { projectId, userId, kind, templateId, styleId } = payment.notes;

  // The notes were written by us when the order was created. If they are not here, this
  // payment was not for something we know how to unlock — worth saying loudly, because it
  // means money moved and nothing happened.
  if (
    !userId ||
    (kind !== "publish" &&
      kind !== "pro" &&
      kind !== "premium" &&
      kind !== "template" &&
      kind !== "style" &&
      kind !== "advanced" &&
      kind !== "generation_pass")
  ) {
    console.error("[payments] captured payment carries no usable notes", {
      paymentId: payment.paymentId,
      orderId: payment.orderId,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (kind === "advanced") {
    try {
      await grantAdvanced(userId);
    } catch (error) {
      console.error("[payments] could not grant Advanced after payment", {
        paymentId: payment.paymentId,
        userId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    console.info("[payments] Advanced unlocked", { userId, paymentId: payment.paymentId });
    return NextResponse.json({ ok: true });
  }

  if (kind === "generation_pass") {
    try {
      await grantGenerationPassPurchase(userId);
    } catch (error) {
      console.error("[payments] could not grant generation pass after payment", {
        paymentId: payment.paymentId,
        userId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    console.info("[payments] generation pass granted", { userId, paymentId: payment.paymentId });
    return NextResponse.json({ ok: true });
  }

  if (kind === "template") {
    if (!templateId) {
      console.error("[payments] captured template payment carries no design", {
        paymentId: payment.paymentId,
        orderId: payment.orderId,
      });
      return NextResponse.json({ ok: true, ignored: true });
    }
    try {
      await grantTemplate(userId, templateId);
    } catch (error) {
      console.error("[payments] could not grant template after payment", {
        paymentId: payment.paymentId,
        userId,
        templateId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    console.info("[payments] template unlocked", { userId, templateId, paymentId: payment.paymentId });
    return NextResponse.json({ ok: true });
  }

  if (kind === "style") {
    if (!styleId) {
      console.error("[payments] captured look payment carries no style", {
        paymentId: payment.paymentId,
        orderId: payment.orderId,
      });
      return NextResponse.json({ ok: true, ignored: true });
    }
    try {
      await grantStyle(userId, styleId);
    } catch (error) {
      console.error("[payments] could not grant look after payment", {
        paymentId: payment.paymentId,
        userId,
        styleId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    console.info("[payments] look unlocked", { userId, styleId, paymentId: payment.paymentId });
    return NextResponse.json({ ok: true });
  }

  if (kind === "pro" || kind === "premium") {
    const label = kind === "premium" ? "Premium" : "Pro";
    try {
      if (kind === "premium") await grantPremium(userId);
      else await grantPro(userId);
    } catch (error) {
      console.error(`[payments] could not grant ${label} after payment`, {
        paymentId: payment.paymentId,
        userId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    console.info(`[payments] ${label} unlocked`, { userId, paymentId: payment.paymentId });
    return NextResponse.json({ ok: true });
  }

  if (!projectId) {
    console.error("[payments] captured publish payment carries no project", {
      paymentId: payment.paymentId,
      orderId: payment.orderId,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    await grantPublish(projectId, userId, "paid");
  } catch (error) {
    // 500 asks Razorpay to try again. Granting twice is a no-op — the unique index on
    // (project_id, kind) sees to that — so a retry is always safe and losing the grant is
    // not: the person has paid and cannot publish.
    console.error("[payments] could not grant publish after payment", {
      paymentId: payment.paymentId,
      projectId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  console.info("[payments] publish unlocked", { projectId, paymentId: payment.paymentId });
  return NextResponse.json({ ok: true });
}
