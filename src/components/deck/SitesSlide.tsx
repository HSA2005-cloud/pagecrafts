import { SitesEmpty, SitesError } from "@/components/dashboard/SitesEmpty";
import { SitesGrid } from "@/components/dashboard/SitesGrid";
import { SignInPrompt } from "@/components/deck/SignInPrompt";
import type { ProjectSummary } from "@/lib/contracts";

export function SitesSlide({
    signedIn,
    sites,
    email,
}: {
    signedIn: boolean;
    sites: ProjectSummary[] | null;
    email?: string;
}) {
    return (
        <section id="sites" className="page-slide page-slide-tall" aria-labelledby="sites-heading">
            <div className="mx-auto w-full max-w-6xl px-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h2 id="sites-heading" className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            Your sites
                        </h2>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            {signedIn
                                ? sites && sites.length > 0
                                    ? "Pick one up where you left it, or start something new."
                                    : "Everything you make lives here."
                                : "Sign in and every site you make will live here."}
                        </p>
                    </div>

                    {signedIn && sites && sites.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {sites.length} site{sites.length === 1 ? "" : "s"}
                        </p>
                    ) : null}
                </div>

                <div className="mt-8">
                    {!signedIn ? (
                        <SignInPrompt
                            title="Your sites are waiting behind a sign-in"
                            body="Nothing here is public. Sign in and you will see every site you have started."
                        />
                    ) : sites === null ? (
                        <SitesError />
                    ) : sites.length === 0 ? (
                        <SitesEmpty />
                    ) : (
                        <SitesGrid sites={sites} email={email ?? ""} />
                    )}
                </div>
            </div>
        </section>
    );
}
