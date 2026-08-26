import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Pricing lives on User Plans — keep old links working. */
export default function PricingPage() {
    redirect("/plans");
}
