import { LookCompareDemo } from "@/components/marketing/LookCompareDemo";

export function CompareSlide() {
    return (
        <section
            id="compare"
            className="page-slide page-slide-tall"
            aria-labelledby="compare-heading"
        >
            <div className="mx-auto w-full max-w-6xl px-6 py-4 sm:py-8">
                <LookCompareDemo />
            </div>
        </section>
    );
}
