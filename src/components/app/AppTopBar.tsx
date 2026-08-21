import Link from "next/link";
import { Bell, Plus, Sparkles } from "lucide-react";

import type { Viewer } from "@/lib/auth/session";
import { BrandMark } from "@/components/landing/BrandMark";
import { FlowSteps } from "@/components/app/FlowSteps";
import { ProfileMenu } from "@/components/settings/ProfileMenu";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export function AppTopBar({
    user,
    step,
}: {
    user: Viewer | null;
    step: 1 | 2 | 3;
}) {
    return (
        <header className="flex h-20 w-full shrink-0 items-center gap-4 border-b border-border/60 bg-background/40 px-6 backdrop-blur-xl lg:border-b-0 lg:bg-transparent lg:backdrop-blur-none">
            {/* The sidebar carries the lockup from lg up; below that it lives here. */}
            <Link href="/" className="lg:hidden">
                <BrandMark />
            </Link>

            <div className="hidden flex-1 justify-center lg:flex">
                <FlowSteps current={step} />
            </div>

            {/* No room for the full stepper on a phone, but never no sense of place. */}
            <span className="hidden text-sm text-muted-foreground sm:inline lg:hidden">
                Step {step} of 3
            </span>

            <div className="ml-auto flex items-center gap-3 lg:ml-0">
                {/* The sidebar's main action, kept reachable while the sidebar is hidden. */}
                <Link
                    href="/new"
                    className={buttonVariants({
                        variant: "brand",
                        className: "rounded-lg font-semibold lg:hidden",
                    })}
                >
                    <Plus aria-hidden />
                    New
                </Link>

                <span className="hidden items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground sm:flex">
                    <Sparkles className="size-4 text-primary" strokeWidth={1.75} aria-hidden />
                    AI Assistant
                    <Badge variant="secondary" className="px-2 py-0 text-[10px]">
                        Soon
                    </Badge>
                </span>

                {/* Notifications have no feed behind them yet, so the bell is present but
                    inert — the shell's shape without a control that pretends to work. */}
                <span
                    aria-hidden
                    className="hidden size-9 items-center justify-center rounded-full border border-border text-muted-foreground sm:flex"
                >
                    <Bell className="size-4" strokeWidth={1.75} />
                </span>

                {user ? (
                    <ProfileMenu user={user} variant="avatar" />
                ) : (
                    <Link
                        href="/signin"
                        // Padded to a thumb-sized target rather than the 46x20 the text
                        // alone gave it. It sits beside a 36px avatar when signed in, so
                        // matching that height also stops the bar shifting at sign-in.
                        className="inline-flex min-h-9 items-center rounded-md px-2 text-sm font-semibold text-foreground transition-colors hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Sign in
                    </Link>
                )}
            </div>
        </header>
    );
}
