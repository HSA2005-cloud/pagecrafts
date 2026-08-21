import type { AccountPlan } from "@/lib/contracts";
import { ACCOUNT_PLAN_LABEL } from "@/lib/contracts";
import { PREMIUM_PRICE_INR, PRO_PRICE_INR } from "@/lib/payments/pricing";

/** Account plans. Prices are rupees, paid once through Razorpay. */
export const PLAN_PRICE_INR: Record<Exclude<AccountPlan, "starter">, number> = {
  pro: PRO_PRICE_INR,
  premium: PREMIUM_PRICE_INR,
};

export const PLAN_COPY: Record<
  AccountPlan,
  { name: string; price: string; description: string; points: string[] }
> = {
  starter: {
    name: ACCOUNT_PLAN_LABEL.starter,
    price: "Free",
    description:
      "Build with AI, use Starter designs and the Casual look, and publish free sites at no charge. Upgrade when you want Pro or Premium designs.",
    points: [
      "All Starter catalogue designs",
      "Casual look on AI-generated sites",
      "Publish free designs at no charge",
      "AI generations capped per site (see AI packages)",
    ],
  },
  pro: {
    name: ACCOUNT_PLAN_LABEL.pro,
    price: `Rs ${PRO_PRICE_INR}`,
    description:
      "One payment unlocks every Pro design in the catalogue and the Photo-rich look — not a single template. Stays until you change plan.",
    points: [
      "Everything in Starter",
      "All templates marked Pro",
      "Photo-rich look on AI sites",
      "Publish without a separate design checkout",
      "Edit live sites after the free window",
    ],
  },
  premium: {
    name: ACCOUNT_PLAN_LABEL.premium,
    price: `Rs ${PREMIUM_PRICE_INR}`,
    description:
      "One payment unlocks every Premium design, every Pro design, and the Animated look. Top account unlock — no auto-renew.",
    points: [
      "Everything in Pro",
      "All templates marked Premium",
      "Animated look on AI sites",
      "Stays until you change plan",
    ],
  },
};

export function planName(plan: AccountPlan): string {
  return ACCOUNT_PLAN_LABEL[plan];
}

/** Whether this account plan already unlocks the paid design they picked. */
export function planCovers(have: AccountPlan | null | undefined, need: "pro" | "premium"): boolean {
  if (!have || have === "starter") return false;
  if (need === "pro") return have === "pro" || have === "premium";
  return have === "premium";
}
