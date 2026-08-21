"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiResult, ErrorCode } from "@/lib/contracts";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";

const CONFIRM = "delete my account";

const MESSAGES: Partial<Record<ErrorCode, string>> = {
    validation_failed: "Check the details above and try again.",
    unauthorized: "That email and password do not match. Try again.",
    rate_limited: "Too many attempts. Wait a few minutes and try again.",
    internal:
        "We could not finish that just now. Nothing is wrong with your details — try again in a moment.",
};

// Closing an account (M-account, C-12).
//
// Irreversible, so confirmation is deliberate: type the words, then re-enter the password.
// Bought templates and looks are revoked with the account — that has to be said out loud.
export function DeleteAccount({ email }: { email: string }) {
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState("");
    const [password, setPassword] = useState("");
    const [state, setState] = useState<"idle" | "deleting" | "failed">("idle");
    const [error, setError] = useState<string | null>(null);

    const armed =
        typed.trim().toLowerCase() === CONFIRM && password.length >= MIN_PASSWORD_LENGTH;

    function reset() {
        setOpen(false);
        setTyped("");
        setPassword("");
        setState("idle");
        setError(null);
    }

    async function remove() {
        if (!armed) return;
        setState("deleting");
        setError(null);

        try {
            const response = await fetch("/api/v1/account", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const body = (await response.json()) as ApiResult<{ deleted: true }>;

            if (!body?.ok) {
                setState("failed");
                setError(
                    MESSAGES[body?.error?.code ?? "internal"] ??
                        body?.error?.message ??
                        MESSAGES.internal!,
                );
                return;
            }

            // Full navigation: the session this page was rendered with no longer refers
            // to anything, and every cached server component belongs to a gone user.
            window.location.href = "/";
        } catch {
            setState("failed");
            setError(MESSAGES.internal!);
        }
    }

    return (
        <div className="rounded-2xl border-2 border-destructive/60 bg-destructive/15 p-5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_35%,transparent)]">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/25 text-destructive">
                    <AlertTriangle className="size-4" strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-destructive">Delete your account</p>
                    <p className="mt-1.5 text-sm leading-6 text-foreground/90">
                        This permanently removes your account, every site you have made, their
                        files, and their version history.{" "}
                        <span className="font-semibold text-destructive">
                            Any templates or looks you bought will be lost and cannot be restored.
                        </span>{" "}
                        Sites you have already published stay online — they are yours.
                    </p>
                </div>
            </div>

            {!open ? (
                <Button
                    variant="destructive"
                    size="sm"
                    className="mt-4 min-h-11 rounded-lg font-semibold"
                    onClick={() => setOpen(true)}
                >
                    Delete my account
                </Button>
            ) : (
                <div className="mt-5 space-y-4 rounded-xl border border-destructive/40 bg-background/40 p-4">
                    <p className="text-sm font-medium text-destructive" role="status">
                        Are you sure? This cannot be undone. Bought designs will be gone with the
                        account.
                    </p>

                    <div>
                        <label htmlFor="confirm-delete" className="text-sm text-muted-foreground">
                            Type <span className="font-semibold text-foreground">{CONFIRM}</span>{" "}
                            to confirm.
                        </label>
                        <Input
                            id="confirm-delete"
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            autoComplete="off"
                            className="mt-2 max-w-sm border-destructive/40"
                            placeholder={CONFIRM}
                        />
                    </div>

                    <PasswordField
                        id="confirm-delete-password"
                        label="Enter your password"
                        value={password}
                        onChange={setPassword}
                        autoComplete="current-password"
                        invalid={Boolean(error)}
                        describedBy={error ? "delete-account-error" : undefined}
                        placeholder="Your PageCrafts password"
                    />

                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            variant="destructive"
                            size="sm"
                            className="min-h-11 rounded-lg font-semibold"
                            disabled={!armed || state === "deleting"}
                            onClick={() => void remove()}
                        >
                            {state === "deleting" ? "Deleting…" : "Yes, delete everything"}
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 rounded-lg font-medium"
                            onClick={reset}
                        >
                            Keep my account
                        </Button>
                    </div>

                    <p
                        id="delete-account-error"
                        aria-live="polite"
                        className="text-xs text-destructive"
                    >
                        {error}
                    </p>
                </div>
            )}
        </div>
    );
}
