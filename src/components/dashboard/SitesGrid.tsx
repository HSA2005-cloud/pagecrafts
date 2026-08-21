"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SiteCard } from "@/components/dashboard/SiteCard";
import { SitesEmpty } from "@/components/dashboard/SitesEmpty";
import type { ProjectSummary } from "@/lib/contracts";

export function SitesGrid({
    sites,
    email,
}: {
    sites: ProjectSummary[];
    email: string;
}) {
    const router = useRouter();
    const [deletedIds, setDeletedIds] = useState<string[]>([]);
    const [removedName, setRemovedName] = useState<string | null>(null);
    const remaining = sites.filter((site) => !deletedIds.includes(site.id));

    function handleDeleted(site: ProjectSummary) {
        setDeletedIds((ids) => [...ids, site.id]);
        setRemovedName(site.name);
        router.refresh();
    }

    return (
        <div>
            <div aria-live="polite">
                {removedName ? (
                    <p className="mb-4 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-foreground">
                        {removedName} has been removed from your sites.
                    </p>
                ) : null}
            </div>

            {remaining.length === 0 ? (
                <SitesEmpty />
            ) : (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {remaining.map((site, i) => (
                        <SiteCard
                            key={site.id}
                            site={site}
                            index={i + 1}
                            email={email}
                            onDeleted={() => handleDeleted(site)}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}
