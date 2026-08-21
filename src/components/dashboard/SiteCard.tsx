'use client';

import { useEffect, useState } from 'react';
import Link from "next/link";
import { ExternalLink, Globe, PencilLine } from "lucide-react";

import type { ProjectStatus, ProjectSummary } from "@/lib/contracts";
import { DeleteSiteButton } from "@/components/dashboard/DeleteSiteDialog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CardIndex } from "@/components/ui/card-index";
import { cn } from "@/lib/utils";

// One site on the dashboard (V-7).
//
// The point of this card is that a person can tell what state a site is in without opening
// it. Three things decide that and they are read in order: is it live, did the last attempt
// fail, or has it never been published.

const STATUS_LABEL: Record<ProjectStatus, string> = {
    draft: "Not published",
    pending: "Publishing",
    provisioning: "Publishing",
    pushing: "Publishing",
    enabling_hosting: "Publishing",
    verifying: "Almost live",
    live: "Live",
    failed: "Publish failed",
};

/** Muted for the ordinary states; only live and failed earn a colour. */
function statusTone(status: ProjectStatus): string {
    if (status === "live") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
    if (status === "failed") return "border-destructive/40 bg-destructive/10 text-destructive";
    if (status === "draft") return "border-border bg-secondary text-muted-foreground";
    return "border-primary/40 bg-primary/10 text-primary";
}

/**
 * "2 hours ago" rather than a timestamp.
 *
 * Previously rendered on the server from a stored UTC time. The time label is now computed
 * on the client so it can be kept up to date without violating server-component purity.
 */
function updatedAgo(iso: string, now: number): string {
    const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function SiteCard({
    site,
    index,
    email,
    onDeleted,
}: {
    site: ProjectSummary;
    index?: number;
    email: string;
    onDeleted: () => void;
}) {
    const status = site.status;

    const [now, setNow] = useState(() => Date.now());

    // Refresh once a minute so "Edited X ago" remains meaningful without reloading.
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(id);
    }, []);

    return (
        <li className="glass-panel card-hover relative flex flex-col overflow-hidden rounded-2xl p-5">
            {index != null ? <CardIndex n={index} /> : null}
            <div className="relative z-[1] flex items-start gap-3">
                <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
                    {site.name}
                </h3>
                <Badge
                    variant="outline"
                    className={cn("shrink-0 px-2.5 py-0.5 text-[11px] font-medium", statusTone(status))}
                >
                    {STATUS_LABEL[status] ?? "Not published"}
                </Badge>
            </div>

            <p className="relative z-[1] mt-1.5 text-xs text-muted-foreground">
                Edited {updatedAgo(site.updatedAt, now)}
            </p>

            {/* A failed publish is explained here rather than only inside the project, which
                is the whole reason the dashboard reads deployments at all (V-7). The words
                come from the failure map, so they are the same ones the publish screen used. */}
            {site.failure ? (
                <p className="relative z-[1] mt-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    <span className="text-foreground">{site.failure.what}</span> {site.failure.next}
                </p>
            ) : null}

            {/* Only a verified live URL is ever offered (C-05). listProjects returns null for
                anything that has not reached live, so there is no link to a site that is not
                answering yet. */}
            {site.liveUrl ? (
                <a
                    href={site.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="relative z-[1] mt-3 inline-flex items-center gap-1.5 truncate text-xs font-medium text-primary hover:underline"
                >
                    <Globe className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{site.liveUrl.replace(/^https:\/\//, "")}</span>
                    <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden />
                </a>
            ) : null}

            <div className="relative z-[1] mt-auto flex gap-2 pt-5">
                <Link
                    href={`/editor/${site.id}`}
                    className={buttonVariants({
                        variant: "outline-brand",
                        size: "sm",
                        className: "flex-1 rounded-lg font-medium",
                    })}
                >
                    <PencilLine aria-hidden />
                    Edit
                </Link>
                <DeleteSiteButton
                    siteId={site.id}
                    siteName={site.name}
                    email={email}
                    onDeleted={onDeleted}
                />
            </div>
        </li>
    );
}
