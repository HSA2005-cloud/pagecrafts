"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

// Training-data consent (M-account · [R2] §11 R11).
//
// Off by default and load-bearing: whether a person's prompts and the sites made from them
// may be kept for improving the model is their decision, and it is not one that can be
// assumed from silence or inferred from use.
//
// So the control says which state it is in and what the other state would mean, rather than
// a switch with a label. A person should be able to tell what is true now without having to
// work out which way round the toggle reads.
export function TrainingConsent({
    initial,
    framed = true,
}: {
    initial: boolean;
    framed?: boolean;
}) {
    const [optedIn, setOptedIn] = useState(initial);
    const [state, setState] = useState<"idle" | "saving" | "failed">("idle");

    async function set(next: boolean) {
        setState("saving");

        try {
            const response = await fetch("/api/v1/account/consent", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ trainingOptIn: next }),
            });

            if (!response.ok) throw new Error("refused");

            setOptedIn(next);
            setState("idle");
        } catch {
            // The switch stays where it was. A control that moves and then silently fails
            // would tell someone their consent is one thing while the database says another,
            // which of all the settings on this page is the worst one to be wrong about.
            setState("failed");
        }
    }

    const body = (
        <>
            <p className="text-base font-semibold text-foreground">
                {framed ? "Help improve PageCrafts" : "AI & product improvement"}
            </p>

            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                {optedIn
                    ? "Your prompts and sites may help improve PageCrafts. You can turn this off anytime."
                    : "Your prompts and sites are only used to build your site. Off unless you turn it on."}
            </p>

            <div className="mt-4 flex items-center gap-3">
                <Button
                    variant={optedIn ? "outline" : "outline-brand"}
                    size="sm"
                    className="cursor-pointer rounded-lg font-medium"
                    disabled={state === "saving"}
                    onClick={() => set(!optedIn)}
                >
                    {state === "saving" ? "Saving…" : optedIn ? "Turn this off" : "Turn this on"}
                </Button>

                <p aria-live="polite" className="text-xs text-muted-foreground">
                    {state === "failed"
                        ? "That did not save. Nothing has changed — try again."
                        : optedIn
                          ? "Currently on"
                          : "Currently off"}
                </p>
            </div>
        </>
    );

    if (!framed) return body;

    return <div className="rounded-2xl glass-panel p-5">{body}</div>;
}
