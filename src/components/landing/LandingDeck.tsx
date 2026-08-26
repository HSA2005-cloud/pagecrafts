import type { CSSProperties } from "react";
import { Hero } from "@/components/landing/Hero";
import { HeroArtwork } from "@/components/landing/HeroArtwork";
import { LandingMoves } from "@/components/landing/LandingMoves";
import { LandingShowcase } from "@/components/landing/LandingShowcase";
import { LandingTalk } from "@/components/landing/LandingTalk";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SlideNav } from "@/components/landing/SlideNav";
import { parseTemplateQuery, queryTemplates } from "@/lib/templates/query";
import {
    pickLandingHeroTemplates,
    pickLandingShowcaseTemplates,
} from "@/lib/templates/hero-frames";

export const LANDING_SLIDES = [
    { id: "top", label: "Intro" },
    { id: "moves", label: "Moves" },
    { id: "canvas", label: "Canvas" },
    { id: "showcase", label: "Showcase" },
] as const;

export function LandingDeck() {
    const library = queryTemplates(parseTemplateQuery(new URLSearchParams())).items;
    const templates = pickLandingHeroTemplates(library);
    const showcase = pickLandingShowcaseTemplates(library);

    return (
        <div className="relative">
            <SiteHeader minimal />
            <SlideNav slides={LANDING_SLIDES} />

            <div className="page-deck">
                <main>
                    <section id="top" className="page-slide">
                        <div className="mx-auto grid w-full max-w-7xl min-h-0 grid-cols-1 items-center gap-8 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
                            <Hero />
                            <div
                                data-reveal
                                style={{ "--reveal": 1 } as CSSProperties}
                                className="hidden min-w-0 sm:block"
                            >
                                <HeroArtwork templates={templates} />
                            </div>
                        </div>
                    </section>
                    <LandingMoves />
                    <LandingTalk />
                    <LandingShowcase templates={showcase} />
                </main>
            </div>
        </div>
    );
}
