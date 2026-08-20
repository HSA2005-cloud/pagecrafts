"use client";

import { useState } from "react";

export function SignOutButton() {
    const [busy, setBusy] = useState(false);

    async function signOut() {
        if (busy) return;
        setBusy(true);
        try {
            await fetch("/api/v1/auth/logout", {
                method: "POST",
                credentials: "same-origin",
            });
        } finally {
            window.location.href = "/?mode=signin#sign-in";
        }
    }

    return (
        <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="rounded-md text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
            {busy ? "Signing out…" : "Sign out"}
        </button>
    );
}
