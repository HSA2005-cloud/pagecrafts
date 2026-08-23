import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** AI usage is tied to Starter / Pro / Premium — keep old links working. */
export default function PackagesPage() {
    redirect("/plans");
}
