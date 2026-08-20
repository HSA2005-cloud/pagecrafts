import { Suspense } from "react";
import { LandingDeck } from "@/components/landing/LandingDeck";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SlideNav } from "@/components/landing/SlideNav";
import { ValueProps } from "@/components/landing/ValueProps";
import { viewer, type Viewer } from "@/lib/auth/session";
import { supabaseViewerClient } from "@/lib/auth/server";
import { listProjects } from "@/lib/data/projects";
import { getAccount } from "@/lib/data/account";
import type { AccountResponse, ProjectSummary } from "@/lib/contracts";
import { parseTemplateQuery, queryTemplates, type TemplateSummary } from "@/lib/templates/query";
import { WelcomeSlide } from "@/components/deck/WelcomeSlide";
import { BuildSlide } from "@/components/deck/BuildSlide";
import { SitesSlide } from "@/components/deck/SitesSlide";
import { SettingsSlide } from "@/components/deck/SettingsSlide";
import { SlideTo } from "@/components/deck/SlideTo";

export const dynamic = "force-dynamic";

export const HOME_SLIDES = [
    { id: "welcome", label: "Welcome" },
    { id: "how-it-works", label: "How it works" },
    { id: "build", label: "Build" },
    { id: "sites", label: "Your sites" },
    { id: "settings", label: "Settings" },
] as const;

type Params = Record<string, string | string[] | undefined>;

export default async function RootPage({
    searchParams,
}: {
    searchParams: Promise<Params>;
}) {
    await searchParams;
    const user = await viewer();

    if (!user) {
        return <LandingDeck />;
    }

    let sites: ProjectSummary[] | null = [];
    let account: AccountResponse | null = null;
    try {
        const supabase = await supabaseViewerClient();
        try {
            sites = await listProjects(supabase, user.id);
        } catch {
            sites = null;
        }
        try {
            account = await getAccount(supabase);
        } catch {
            account = null;
        }
    } catch {
        sites = null;
        account = null;
    }

    // Build always shows the first twelve from the full library. URL filters belong
    // on /templates — carrying them onto home emptied the grid (a leftover `q`
    // from describe used to leave one tile where twelve belong).
    const templates = queryTemplates(parseTemplateQuery(new URLSearchParams())).items;

    return <Home user={user} sites={sites} account={account} templates={templates} />;
}

function Home({
    user,
    sites,
    account,
    templates,
}: {
    user: Viewer;
    sites: ProjectSummary[] | null;
    account: AccountResponse | null;
    templates: TemplateSummary[];
}) {
    return (
        <div className="relative">
            <SiteHeader user={user} />
            <SlideNav slides={HOME_SLIDES} />
            <Suspense fallback={null}>
                <SlideTo />
            </Suspense>

            <div className="page-deck">
                <main>
                    <WelcomeSlide name={user.name} templates={templates} />
                    <ValueProps />
                    <BuildSlide templates={templates} />
                    <SitesSlide signedIn sites={sites} email={user.email} />
                    <SettingsSlide account={account} />
                </main>
            </div>
        </div>
    );
}
