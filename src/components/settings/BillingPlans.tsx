"use client";

import { useState } from "react";
import Link from "next/link";

import type { AccountResponse, BillingHistoryItem, BillingSummary } from "@/lib/contracts";
import { ACCOUNT_PLAN_LABEL } from "@/lib/contracts";
import { PLAN_COPY } from "@/lib/payments/plans";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function historyLine(item: BillingHistoryItem): string {
  const when = new Date(item.grantedAt).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const what =
    item.kind === "template"
      ? "Design"
      : item.kind === "style"
        ? "Look"
        : item.kind === "publish"
          ? "Publish"
          : item.kind === "advanced"
            ? "Advanced AI"
            : item.kind === "premium"
              ? "Premium"
              : item.kind === "pro"
                ? "Pro"
                : "Unlock";
  const how =
    item.source === "paid" ? "paid" : item.source === "launch_offer" ? "launch offer" : "grant";
  const state = item.status === "active" ? "" : ` · ${item.status}`;
  return `${what} · ${how} · ${when}${state}`;
}

function planPaymentLine(plan: BillingSummary["plan"], history: BillingHistoryItem[]): string {
  if (plan === "starter") return "Free · no payment due";

  const paidPlan = history.find(
    (item) =>
      item.source === "paid" &&
      item.status === "active" &&
      ((plan === "pro" && item.kind === "pro") ||
        (plan === "premium" && (item.kind === "premium" || item.kind === "pro"))),
  );
  const when = paidPlan
    ? new Date(paidPlan.grantedAt).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const price = PLAN_COPY[plan].price;
  if (when) return `One-time ${price} · paid ${when} · stays until you change plan`;
  return `One-time ${price} · no auto-renew · stays until you change plan`;
}

export function BillingPlans({
  initial,
}: {
  account: AccountResponse;
  initial: BillingSummary;
}) {
  const [billing] = useState<BillingSummary>(initial);
  const history = billing.history;
  const paidLines = history.filter((item) => item.source === "paid");
  const plan = billing.plan;
  const planLabel = ACCOUNT_PLAN_LABEL[plan];

  return (
    <div className="rounded-2xl glass-panel p-5">
      <p className="text-base font-semibold text-foreground">Billing &amp; Plan</p>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        Your current plan and how it was paid. AI builds per site are listed under AI credits
        above.
      </p>

      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <dt className="text-muted-foreground">Current plan</dt>
          <dd className="font-medium text-foreground">{planLabel}</dd>
        </div>
        <div className="flex min-h-9 flex-wrap items-start justify-between gap-2">
          <dt className="text-muted-foreground">Renewal / payment</dt>
          <dd className="max-w-sm text-right text-foreground">
            {planPaymentLine(plan, history)}
          </dd>
        </div>
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <dt className="text-muted-foreground">Payment history</dt>
          <dd className="text-right text-muted-foreground">
            {history.length === 0 ? (
              "No payments yet"
            ) : (
              <ul className="space-y-1">
                {history.slice(0, 5).map((item) => (
                  <li key={item.id} className="text-foreground">
                    {historyLine(item)}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <dt className="text-muted-foreground">Invoices and receipts</dt>
          <dd className="text-muted-foreground">
            {paidLines.length === 0
              ? "None yet"
              : "Razorpay emails the receipt for each payment"}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <Link
          href="/plans"
          className={cn(
            buttonVariants({
              variant: "brand",
              className: "min-h-11 cursor-pointer font-semibold",
            }),
          )}
        >
          Manage Plan
        </Link>
      </div>
    </div>
  );
}
