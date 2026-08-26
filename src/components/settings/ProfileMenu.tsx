"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import type { AccountResponse, BillingSummary, NotifyPrefs } from "@/lib/contracts";
import { ACCOUNT_PLAN_LABEL, canUpgradePlan, DEFAULT_NOTIFY_PREFS } from "@/lib/contracts";
import { apiGet, apiPatch } from "@/lib/api/client";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { PreferenceSwitch } from "@/components/settings/PreferenceSwitch";
import { cn } from "@/lib/utils";

const MENU_LINK =
  "flex min-h-9 cursor-pointer items-center rounded-lg px-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const SETTINGS_HREF = "/?slide=settings";

function scrollToSettings() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("settings")?.scrollIntoView({
    behavior: reduce ? "auto" : "smooth",
    block: "start",
  });
  window.history.replaceState(null, "", SETTINGS_HREF);
}

export function ProfileMenu({
  user,
  variant = "name",
  placement = "bottom",
}: {
  user: { name: string; email: string };
  variant?: "name" | "avatar" | "card";
  placement?: "bottom" | "top";
}) {
  const pathname = usePathname();
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [plan, setPlan] = useState<BillingSummary["plan"] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      apiGet<AccountResponse>("/api/v1/account"),
      apiGet<BillingSummary>("/api/v1/account/billing"),
    ]).then(([account, billing]) => {
      if (cancelled) return;
      if (account.data) setPrefs(account.data.notifyPrefs);
      if (billing.data) setPlan(billing.data.plan);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setEmail(on: boolean) {
    const current = prefs ?? DEFAULT_NOTIFY_PREFS;
    const next = { ...current, email: on };
    const previous = prefs;
    setPrefs(next);
    setSaving(true);
    const { error } = await apiPatch<AccountResponse>("/api/v1/account/notifications", {
      notifyPrefs: next,
    });
    if (error) setPrefs(previous);
    setSaving(false);
  }

  function openSettings(event: MouseEvent<HTMLAnchorElement>, focusId?: string) {
    // Already on the home deck — scroll in place. Going via /settings remounts the
    // whole page and feels like a hang.
    if (pathname !== "/") return;
    event.preventDefault();
    const details = event.currentTarget.closest("details");
    if (details) details.open = false;
    if (focusId) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(focusId)?.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "start",
      });
      window.history.replaceState(null, "", `${SETTINGS_HREF}#${focusId}`);
      return;
    }
    scrollToSettings();
  }

  const initial = user.name.slice(0, 1);

  return (
    <details className="group relative">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 rounded-md marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden",
          variant === "avatar" && "size-9 justify-center",
          variant === "card" && "w-full",
        )}
      >
        {variant === "avatar" ? (
          <>
            <span
              title={user.email}
              className="flex size-9 items-center justify-center rounded-full border border-primary/40 text-sm font-semibold uppercase text-foreground"
            >
              <span aria-hidden>{initial}</span>
            </span>
            <span className="sr-only">Account menu for {user.email}</span>
          </>
        ) : variant === "card" ? (
          <span className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/60 p-3">
            <span
              aria-hidden
              className="brand-gradient flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase text-primary-foreground"
            >
              {initial}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              strokeWidth={1.75}
              aria-hidden
            />
          </span>
        ) : (
          <>
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 text-xs font-semibold uppercase sm:hidden"
            >
              {initial}
            </span>
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.name}</span>
            <ChevronDown
              className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="sr-only">Account menu</span>
          </>
        )}
      </summary>

      <div
        className={cn(
          // Solid surface — glass-panel is too transparent over Welcome scene cards,
          // so plan / notices text washed out behind a blurry white overlay.
          "absolute z-50 w-72 overflow-hidden rounded-2xl border border-border bg-card p-3 text-foreground shadow-[0_16px_48px_rgba(0,0,0,0.55)]",
          placement === "top" ? "bottom-full mb-3 left-0" : "right-0 mt-3",
        )}
      >
        <p className="truncate px-2 text-xs text-muted-foreground">{user.email}</p>
        {plan ? (
          <div className="flex min-h-9 items-center justify-between gap-3 px-2">
            <p className="text-sm text-foreground">Current plan</p>
            <p className="text-sm font-medium text-foreground">{ACCOUNT_PLAN_LABEL[plan]}</p>
          </div>
        ) : null}
        {plan && canUpgradePlan(plan) ? (
          <Link href="/plans" className={MENU_LINK}>
            Upgrade
          </Link>
        ) : null}
        <div className="flex min-h-11 items-center justify-between gap-3 px-2">
          <p id="profile-email-notices" className="text-sm text-foreground">
            Email notices
          </p>
          <PreferenceSwitch
            checked={prefs?.email ?? DEFAULT_NOTIFY_PREFS.email}
            disabled={saving || prefs === null}
            labelledBy="profile-email-notices"
            onChange={(on) => void setEmail(on)}
          />
        </div>
        <Link href="/?slide=settings" onClick={(e) => openSettings(e)} className={MENU_LINK}>
          Account settings
        </Link>
        <Link
          href="/?slide=settings#ai-credits"
          onClick={(e) => openSettings(e, "ai-credits")}
          className={MENU_LINK}
        >
          AI credits
        </Link>
        <Link href="/plans" className={MENU_LINK}>
          User Plans
        </Link>
        <LogoutButton className={cn(MENU_LINK, "w-full text-left")} />
      </div>
    </details>
  );
}
