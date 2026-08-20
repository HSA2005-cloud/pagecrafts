import Link from "next/link";
import {
    Globe,
    LayoutGrid,
    LayoutTemplate,
    Plus,
    Settings,
    Sparkles,
    Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Viewer } from "@/lib/auth/session";
import { BrandMark } from "@/components/landing/BrandMark";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The product shell's navigation. Destinations that do not exist yet are rendered as
// inert rows rather than links that would 404 — muted, not focusable, and never a
// navigation that dead-ends. Only a row with something to say carries a chip.
interface NavItem {
    label: string;
    icon: LucideIcon;
    href?: string;
    badge?: string;
}

const NAV: NavItem[] = [
    { label: "Build", icon: LayoutTemplate, href: "/#build" },
    { label: "Ask AI", icon: Sparkles, href: "/#build", badge: "Beta" },
    { label: "Your sites", icon: LayoutGrid, href: "/#sites" },
    // Still inert, and deliberately. Domains and Team are post-MVP (Amendment A1 §22.3) with
    // nothing behind them at all — no registrar code, no team or member concept in the
    // database. A row that navigates to "coming soon" is a worse answer than a row that
    // plainly does nothing.
    { label: "Domains", icon: Globe },
    { label: "Team", icon: Users },
    { label: "Settings", icon: Settings, href: "/settings" },
];

const ROW = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium";

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
    const Icon = item.icon;
    const content = (
        <>
            <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="flex-1">{item.label}</span>
        </>
    );

    const badge = item.badge ? (
        <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
            {item.badge}
        </Badge>
    ) : null;

    if (!item.href) {
        return (
            <span aria-disabled className={cn(ROW, "cursor-default text-muted-foreground/70")}>
                {content}
                {badge}
            </span>
        );
    }

    return (
        <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
                ROW,
                "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
        >
            {content}
            {badge}
        </Link>
    );
}

export function AppSidebar({
    user,
    activeHref,
    className,
}: {
    user: Viewer | null;
    activeHref?: string;
    className?: string;
}) {
    return (
        <aside
            className={cn(
                "w-65 shrink-0 flex-col border-r border-border/60 bg-card/30 px-5 py-6 backdrop-blur-xl",
                className,
            )}
        >
            <Link
                href="/"
                className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <BrandMark size="sidebar" />
            </Link>

            <Link
                href="/new"
                className={buttonVariants({
                    variant: "brand",
                    size: "lg",
                    className: "mt-7 w-full rounded-xl font-semibold",
                })}
            >
                <Plus aria-hidden />
                New site
                <Sparkles aria-hidden className="ml-auto opacity-80" />
            </Link>

            <nav aria-label="Sections" className="mt-8">
                <ul className="flex flex-col gap-1">
                    {NAV.map((item) => (
                        <li key={item.label}>
                            <NavRow item={item} active={item.href === activeHref} />
                        </li>
                    ))}
                </ul>
            </nav>

            <div className="mt-auto flex flex-col gap-4 pt-8">
                <div className="rounded-2xl border border-primary/30 bg-accent/40 p-5">
                    <Sparkles className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
                    <p className="mt-3 text-base font-semibold text-foreground">Upgrade to Pro</p>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                        Unlock custom domains, more AI generations, and priority support.
                    </p>
                    <button
                        type="button"
                        disabled
                        title="Billing is not live yet"
                        className="mt-4 w-full rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-brand-ink disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Upgrade now
                    </button>
                </div>

                {user ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-3">
                        <span
                            aria-hidden
                            className="brand-gradient flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase text-primary-foreground"
                        >
                            {user.name.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                                {user.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                                {user.email}
                            </span>
                        </span>
                    </div>
                ) : (
                    <Link
                        href="/signin"
                        className={buttonVariants({
                            variant: "outline-brand",
                            className: "w-full rounded-xl font-semibold",
                        })}
                    >
                        Sign in
                    </Link>
                )}
            </div>
        </aside>
    );
}
