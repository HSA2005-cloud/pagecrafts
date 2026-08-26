import { LookCompareDemo } from "@/components/marketing/LookCompareDemo";
import type { AccountPlan } from "@/lib/contracts";

export function CompareSlide({ plan = "starter" }: { plan?: AccountPlan }) {
    return (
        <section
            id="compare"
            className="page-slide page-slide-tall"
            aria-labelledby="compare-heading"
        >
            <div className="mx-auto w-full max-w-6xl px-6 py-4 sm:py-8">
                <LookCompareDemo plan={plan} />
            </div>
        </section>
    );
}
