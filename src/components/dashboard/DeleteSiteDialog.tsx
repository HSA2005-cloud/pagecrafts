"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { credentialsSchema } from "@/lib/auth/credentials";
import { passwordResetRequestSchema } from "@/lib/contracts/auth";
import type { ApiResult, ErrorCode } from "@/lib/contracts";

// Same sentences the sign-in card uses for the same codes (N-4). A wrong password on
// delete is the same fact as a wrong password at the door.
const MESSAGES: Partial<Record<ErrorCode, string>> = {
    validation_failed: "Check the details above and try again.",
    unauthorized: "That email and password do not match. Try again, or reset your password.",
    rate_limited: "Too many attempts. Wait a few minutes and try again.",
    internal:
        "We could not finish that just now. Nothing is wrong with your details — try again in a moment.",
};

type Mode = "confirm" | "forgot";

export function DeleteSiteDialog({
    open,
    onOpenChange,
    siteId,
    siteName,
    email,
    onDeleted,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    siteId: string;
    siteName: string;
    email: string;
    onDeleted: () => void;
}) {
    const [mode, setMode] = useState<Mode>("confirm");
    const [address, setAddress] = useState(email);
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    function resetForm(nextOpen: boolean) {
        onOpenChange(nextOpen);
        if (nextOpen) return;
        setMode("confirm");
        setAddress(email);
        setPassword("");
        setBusy(false);
        setError(null);
        setSent(false);
    }

    function switchTo(next: Mode) {
        setMode(next);
        setError(null);
        setSent(false);
        setPassword("");
    }

    async function post<T>(path: string, body: unknown, method = "POST"): Promise<ApiResult<T>> {
        const response = await fetch(path, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        return (await response.json()) as ApiResult<T>;
    }

    async function handleForgot(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);

        const parsed = passwordResetRequestSchema.safeParse({ email: address });
        if (!parsed.success) {
            setError("Enter a valid email address.");
            return;
        }

        setBusy(true);
        const result = await post<unknown>("/api/v1/auth/password/reset", parsed.data).catch(
            () => null,
        );
        setBusy(false);
        if (result === null) setError(MESSAGES.internal!);
        else setSent(true);
    }

    async function handleDelete(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);

        const parsed = credentialsSchema.safeParse({ email: address, password });
        if (!parsed.success) {
            setError("Enter your email and password.");
            return;
        }

        setBusy(true);
        const result = await post<{ deleted: true }>(
            `/api/v1/projects/${siteId}`,
            parsed.data,
            "DELETE",
        ).catch(() => null);
        setBusy(false);

        if (result === null) {
            setError(MESSAGES.internal!);
            return;
        }
        if (!result.ok) {
            setError(MESSAGES[result.error.code] ?? MESSAGES.internal!);
            return;
        }

        onDeleted();
        resetForm(false);
    }

    return (
        <Dialog open={open} onOpenChange={resetForm}>
            <DialogContent className="max-w-md rounded-2xl border-border/60 bg-card/95 sm:max-w-md">
                {mode === "forgot" && sent ? (
                    <div aria-live="polite">
                        <DialogHeader>
                            <DialogTitle>Check your email</DialogTitle>
                            <DialogDescription>The link lasts one hour.</DialogDescription>
                        </DialogHeader>
                        <p className="mt-5 text-sm leading-6 text-muted-foreground">
                            If there is an account for{" "}
                            <span className="font-medium text-foreground">{address}</span>, we have
                            sent a link to set a new password.
                        </p>
                        <button
                            type="button"
                            onClick={() => switchTo("confirm")}
                            className="mt-6 rounded-md text-sm font-medium text-brand-ink underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Back to confirmation
                        </button>
                    </div>
                ) : mode === "forgot" ? (
                    <form onSubmit={handleForgot} noValidate>
                        <DialogHeader>
                            <DialogTitle>Reset Your Password</DialogTitle>
                            <DialogDescription>
                                Tell us your email and we will send you a link to set a new password.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="mt-7">
                            <label htmlFor="delete-reset-email" className="block text-sm font-medium text-foreground">
                                Email
                            </label>
                            <Input
                                id="delete-reset-email"
                                name="email"
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                inputSize="lg"
                                placeholder="you@example.com"
                                value={address}
                                onChange={(event) => setAddress(event.target.value)}
                                aria-invalid={error ? true : undefined}
                                className="mt-2"
                                required
                            />
                        </div>

                        <div aria-live="polite">
                            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
                        </div>

                        <Button
                            type="submit"
                            variant="brand"
                            className="mt-7 w-full rounded-lg font-semibold"
                            disabled={busy}
                        >
                            {busy ? "Just a moment…" : "Send Reset Link"}
                        </Button>

                        <button
                            type="button"
                            onClick={() => switchTo("confirm")}
                            className="mt-5 w-full text-center text-sm font-medium text-primary underline underline-offset-4"
                        >
                            Back to confirmation
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleDelete} noValidate>
                        <DialogHeader>
                            <DialogTitle>Delete this site</DialogTitle>
                            <DialogDescription>
                                This removes {siteName} from your account. It cannot be undone. Sites
                                you have already published stay online — they are yours.
                            </DialogDescription>
                        </DialogHeader>

                        <p className="mt-5 text-sm leading-6 text-muted-foreground">
                            Enter the email and password you use to sign in. If you signed in with
                            Google and have not set a password, reset it first.
                        </p>

                        <div className="mt-7">
                            <label htmlFor="delete-site-email" className="block text-sm font-medium text-foreground">
                                Email
                            </label>
                            <Input
                                id="delete-site-email"
                                name="email"
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                inputSize="lg"
                                placeholder="you@example.com"
                                value={address}
                                onChange={(event) => setAddress(event.target.value)}
                                aria-invalid={error ? true : undefined}
                                aria-describedby={error ? "delete-site-error" : undefined}
                                className="mt-2"
                                required
                            />
                        </div>

                        <PasswordField
                            id="delete-site-password"
                            label="Password"
                            value={password}
                            onChange={setPassword}
                            autoComplete="current-password"
                            invalid={Boolean(error)}
                            inputSize="lg"
                        />

                        <div aria-live="polite">
                            {error && (
                                <p id="delete-site-error" className="mt-4 text-sm text-destructive">
                                    {error}
                                </p>
                            )}
                        </div>

                        <Button
                            type="submit"
                            variant="destructive"
                            className="mt-7 w-full rounded-lg font-semibold"
                            disabled={busy}
                        >
                            {busy ? "Deleting…" : "Delete site"}
                        </Button>

                        <button
                            type="button"
                            onClick={() => switchTo("forgot")}
                            className="mt-5 w-full text-center text-sm font-medium text-brand-ink underline underline-offset-4"
                        >
                            Forgot your password?
                        </button>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

export function DeleteSiteButton({
    siteId,
    siteName,
    email,
    onDeleted,
}: {
    siteId: string;
    siteName: string;
    email: string;
    onDeleted: () => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg font-medium text-destructive hover:bg-destructive/10"
                onClick={() => setOpen(true)}
            >
                <Trash2 aria-hidden />
                Delete
            </Button>
            <DeleteSiteDialog
                open={open}
                onOpenChange={setOpen}
                siteId={siteId}
                siteName={siteName}
                email={email}
                onDeleted={onDeleted}
            />
        </>
    );
}
