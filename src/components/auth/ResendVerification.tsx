"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/lib/contracts";

interface ResendData {
    status: "accepted" | "signin";
}

export function ResendVerification({ email }: { email: string }) {
    const [state, setState] = useState<"idle" | "busy" | "sent" | "signin" | "error">("idle");
    const [message, setMessage] = useState<string | null>(null);

    async function resend() {
        setState("busy");
        setMessage(null);
        try {
            const response = await fetch("/api/v1/auth/verify/resend", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const result = (await response.json()) as ApiResult<ResendData>;
            if (!result.ok) {
                setState("error");
                setMessage(result.error.message);
                return;
            }
            if (result.data.status === "signin") {
                setState("signin");
                return;
            }
            setState("sent");
        } catch {
            setState("error");
            setMessage("We could not send that email just now. Try again in a moment.");
        }
    }

    return (
        <div aria-live="polite" className="mt-4 space-y-3">
            {state === "sent" && (
                <p className="text-sm text-muted-foreground">
                    If that address still needs confirming, we have sent another link. Give it a minute, then check spam.
                </p>
            )}
            {state === "signin" && (
                <p className="text-sm text-muted-foreground">
                    This address already has an account. Sign in with Google or your password instead of waiting for a new email.
                </p>
            )}
            {state === "error" && message && (
                <p className="text-sm text-destructive">{message}</p>
            )}
            {state !== "sent" && state !== "signin" && (
                <Button variant="outline" className="w-full" onClick={resend} disabled={state === "busy"}>
                    {state === "busy" ? "Sending…" : state === "error" ? "Try sending again" : "Send it again"}
                </Button>
            )}
        </div>
    );
}
