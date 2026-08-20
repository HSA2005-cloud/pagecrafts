"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/PasswordField";
import { passwordUpdateSchema } from "@/lib/contracts/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";
import type { ApiResult, ErrorCode } from "@/lib/contracts";

const MESSAGES: Partial<Record<ErrorCode, string>> = {
    validation_failed: "Choose a password of at least 10 characters.",
    unauthorized: "That link has expired. Ask for a new one from the sign-in screen.",
    internal: "We could not set your new password just now. Your old one still works — try again in a moment.",
};

export function ResetPasswordForm() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);

        if (password !== confirm) {
            setError("Both passwords need to match.");
            return;
        }
        const parsed = passwordUpdateSchema.safeParse({ password });
        if (!parsed.success) {
            setError(MESSAGES.validation_failed!);
            return;
        }

        setBusy(true);
        try {
            const response = await fetch("/api/v1/auth/password/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(parsed.data),
            });
            const result = (await response.json()) as ApiResult<unknown>;
            if (!result.ok) {
                setError(MESSAGES[result.error.code] ?? MESSAGES.internal!);
                return;
            }
            router.push("/");
            router.refresh();
        } catch {
            setError(MESSAGES.internal!);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="w-full max-w-sm rounded-2xl glass-panel p-6">
            <h1 className="text-lg font-semibold text-card-foreground">Set a new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                At least {MIN_PASSWORD_LENGTH} characters. You will use this to sign in from now on.
            </p>

            <PasswordField id="password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" invalid={Boolean(error)} />
            <PasswordField id="confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={Boolean(error)} />

            <div aria-live="polite">
                {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            </div>

            <Button type="submit" variant="brand" className="mt-5 w-full" disabled={busy}>
                {busy ? "Saving…" : "Save new password"}
            </Button>
        </form>
    );
}