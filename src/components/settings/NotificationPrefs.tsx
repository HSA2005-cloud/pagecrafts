"use client";

import { useState } from "react";

import type { AccountResponse, NotifyPrefs } from "@/lib/contracts";
import { apiPatch } from "@/lib/api/client";
import { PreferenceSwitch } from "@/components/settings/PreferenceSwitch";

const ROWS: { key: keyof NotifyPrefs; id: string; label: string; hint: string }[] = [
  {
    key: "email",
    id: "notify-email",
    label: "Email notifications",
    hint: "Master switch for every notice below.",
  },
  {
    key: "published",
    id: "notify-published",
    label: "Website published successfully",
    hint: "When a site of yours goes live.",
  },
  {
    key: "updated",
    id: "notify-updated",
    label: "Website update completed",
    hint: "When an update has finished processing.",
  },
  {
    key: "payments",
    id: "notify-payments",
    label: "Payment and receipt notices",
    hint: "When a payment lands or a receipt is ready.",
  },
  {
    key: "security",
    id: "notify-security",
    label: "Security alerts",
    hint: "Sign-in and account security notices.",
  },
];

export function NotificationPrefs({ initial }: { initial: NotifyPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");

  async function save(next: NotifyPrefs) {
    const previous = prefs;
    setPrefs(next);
    setState("saving");

    const { error } = await apiPatch<AccountResponse>("/api/v1/account/notifications", {
      notifyPrefs: next,
    });

    if (error) {
      setPrefs(previous);
      setState("failed");
      return;
    }

    setState("idle");
  }

  return (
    <div className="rounded-2xl glass-panel p-5">
      <p className="text-base font-semibold text-foreground">Notifications</p>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        Choose which emails we send.
      </p>

      <ul className="mt-4 divide-y divide-border/60">
        {ROWS.map((row) => {
          const nested = row.key !== "email";
          const disabled = state === "saving" || (nested && !prefs.email);
          return (
            <li key={row.key} className="flex min-h-11 items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p id={row.id} className="text-sm font-medium text-foreground">
                  {row.label}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{row.hint}</p>
              </div>
              <PreferenceSwitch
                checked={nested ? prefs.email && prefs[row.key] : prefs[row.key]}
                disabled={disabled}
                labelledBy={row.id}
                onChange={(on) => save({ ...prefs, [row.key]: on })}
              />
            </li>
          );
        })}
      </ul>

      <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
        {state === "failed" ? "That did not save. Nothing has changed — try again." : null}
      </p>
    </div>
  );
}
