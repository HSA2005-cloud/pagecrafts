import { PricingGuide } from "@/components/marketing/PricingGuide";

export function PricingSlide() {
    return (
        <section
            id="pricing"
            className="page-slide page-slide-tall"
            aria-labelledby="pricing-heading"
        >
            <div className="mx-auto w-full max-w-4xl px-6 py-4 sm:py-8">
                <PricingGuide signedIn />
            </div>
        </section>
    );
}
