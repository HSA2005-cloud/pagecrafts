"use client";

import { useState } from "react";

import type { AccountResponse } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { TrainingConsent } from "@/components/settings/TrainingConsent";

export function PrivacyAndData({ initial }: { initial: AccountResponse }) {
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");

  async function download() {
    setState("saving");
    try {
      const response = await fetch("/api/v1/account/export");
      if (!response.ok) throw new Error("refused");
      const json = await response.json();
      const blob = new Blob([JSON.stringify(json.data ?? json, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "pagecrafts-account.json";
      link.click();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="rounded-2xl glass-panel p-5">
      <p className="text-base font-semibold text-foreground">Privacy &amp; Data</p>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        What we keep, whether it may help improve PageCrafts, and a copy you can take with you.
        Title, SEO and domains for a site live on that site in the editor — not here.
      </p>

      <div className="mt-5 border-t border-border/60 pt-5">
        <TrainingConsent initial={initial.trainingOptIn} framed={false} />
      </div>

      <div className="mt-5 border-t border-border/60 pt-5">
        <p className="text-sm font-medium text-foreground">Download my data</p>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          A JSON copy of your account facts and the names of your sites. It does not include
          file trees or published pages on the internet.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline-brand"
            size="sm"
            className="cursor-pointer rounded-lg font-medium"
            disabled={state === "saving"}
            onClick={() => void download()}
          >
            {state === "saving" ? "Preparing…" : "Download my data"}
          </Button>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {state === "failed" ? "Could not prepare that just now. Try again." : null}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-border/60 pt-5">
        <p className="text-sm font-medium text-foreground">How long we keep it</p>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          We keep your account, sites, and version history while the account is open. Closing
          the account removes that copy. Sites you have already published stay online — they
          are yours, on hosting you were given.
        </p>
      </div>
    </div>
  );
}
