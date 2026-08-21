"use client";

import { useState } from "react";
import Link from "next/link";

import type { AccountResponse, BillingHistoryItem, BillingSummary } from "@/lib/contracts";
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
  const how = item.source === "paid" ? "paid" : item.source === "launch_offer" ? "launch offer" : "grant";
  const state = item.status === "active" ? "" : ` · ${item.status}`;
  return `${what} · ${how} · ${when}${state}`;
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
  const plan = PLAN_COPY[billing.plan];

  return (
    <div className="rounded-2xl glass-panel p-5">
      <p className="text-base font-semibold text-foreground">User Plans</p>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        You are on <span className="font-medium text-foreground">{plan.name}</span>. Upgrade on
        User Plans to unlock every Pro or Premium design — not one template at a time. Cards
        stay with Razorpay.
      </p>

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
          Open User Plans
        </Link>
      </div>

      <dl className="mt-4 space-y-3 text-sm">
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
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <dt className="text-muted-foreground">Payment method</dt>
          <dd className="text-muted-foreground">Cards stay with Razorpay</dd>
        </div>
      </dl>
    </div>
  );
}
