"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordField } from "@/components/auth/PasswordField";
import { credentialsSchema, credentialsIssue, MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";
import { safeNext } from "@/lib/auth/safe-next";
import { signUpFormSchema, passwordResetRequestSchema } from "@/lib/contracts/auth";
import type { ApiResult, ErrorCode } from "@/lib/contracts";

// Supabase returns a session immediately when "Confirm email" is off, and no session
// with pending:true when it is on. The signup route passes that through, so the UI
// sends the user to the right next screen either way.
interface SignUpData {
    user: { id: string; email: string } | null;
    pending: boolean;
}

type Mode = "signup" | "signin" | "forgot";

// Plain-language copy for every failure this screen can reach (N-4, FR-002).
// A user never sees an ErrorCode; they see a sentence and a way forward.
const MESSAGES: Partial<Record<ErrorCode, string>> = {
    validation_failed: "Check the details above and try again.",
    unauthorized: "That email and password do not match. Try again, or reset your password.",
    forbidden: "Confirm your email address to finish setting up your account.",
    rate_limited: "Too many attempts. Wait a few minutes and try again.",
    internal: "We could not finish that just now. Nothing is wrong with your details — try again in a moment.",
};
const FIELD_MESSAGES: Record<string, string> = {
    email: "Enter a valid email address.",
    password: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    confirmPassword: "Both passwords need to match.",
};
const COPY: Record<Mode, { title: string; blurb: string; action: string }> = {
    signup: {
        title: "Get Started Today",
        blurb: "Free to build and edit. You only pay when you go live.",
        action: "Create My Site",
    },
    signin: {
        title: "Welcome Back",
        blurb: "Sign in to pick up where you left off.",
        action: "Sign In",
    },
    forgot: {
        title: "Reset Your Password",
        blurb: "Tell us your email and we will send you a link to set a new password.",
        action: "Send Reset Link",
    },
};

const PANEL =
    "w-full max-w-md scroll-mt-8 rounded-3xl glass-panel p-8 sm:p-10";
const LABEL = "block text-sm font-medium text-foreground";

function PanelHeader({ title, blurb }: { title: string; blurb: string }) {
    return (
        <div className="flex flex-col">
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{blurb}</p>
        </div>
    );
}

export function AuthCard({
    initialMode = "signup",
    next = "/",
}: {
    initialMode?: Mode;
    next?: string;
}) {
    const router = useRouter();
    const destination = safeNext(next);
    const nextQs = destination !== "/" ? `?next=${encodeURIComponent(destination)}` : "";
    const [mode, setMode] = useState<Mode>(initialMode);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    function switchTo(next: Mode) {
        setMode(next);
        setError(null);
        setSent(false);
        setPassword("");
        setConfirmPassword("");
    }

    async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
        const response = await fetch(path, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        return (await response.json()) as ApiResult<T>;
    }

    function visibleError(result: ApiResult<unknown>): string {
        if (result.ok) return MESSAGES.internal!;
        if (result.error.code === "validation_failed" || result.error.code === "forbidden") {
            return result.error.message || (MESSAGES[result.error.code] ?? MESSAGES.internal!);
        }
        return MESSAGES[result.error.code] ?? MESSAGES.internal!;
    }

    async function afterSession(path: string) {
        router.refresh();
        router.push(path);
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        setError(null);

        if (mode === "forgot") {
            const parsed = passwordResetRequestSchema.safeParse({ email });
            if (!parsed.success) {
                setError("Enter a valid email address.");
                return;
            }
            setBusy(true);
            try {
                const result = await post<unknown>("/api/v1/auth/password/reset", parsed.data);
                if (!result.ok) {
                    setError(visibleError(result));
                    return;
                }
                setSent(true);
            } catch {
                setError(MESSAGES.internal!);
            } finally {
                setBusy(false);
            }
            return;
        }

        if (mode === "signup") {
            const parsed = signUpFormSchema.safeParse({ email, password, confirmPassword });
            if (!parsed.success) {
                const issue = parsed.error.issues[0];
                const field = String(issue?.path[0] ?? "");
                if (field === "email" && !email.trim()) setError("Enter your email address.");
                else if (field === "password" && !password) setError("Enter a password.");
                else setError(FIELD_MESSAGES[field] ?? MESSAGES.validation_failed!);
                return;
            }
            setBusy(true);
            const result = await post<SignUpData>("/api/v1/auth/signup", {
                email: parsed.data.email,
                password: parsed.data.password,
                // Optional: stored on the account so we can greet people by name.
                name: name.trim() || undefined,
            }).catch(() => null);
            setBusy(false);

            if (result === null) { setError(MESSAGES.internal!); return; }
            if (!result.ok) { setError(visibleError(result)); return; }
            router.push(
                result.data.pending
                    ? `/verify?email=${encodeURIComponent(parsed.data.email)}`
                    : destination,
            );
            if (!result.data.pending) router.refresh();
            return;
        }

        const issue = credentialsIssue({ email, password });
        if (issue) {
            setError(issue);
            return;
        }
        const parsed = credentialsSchema.parse({ email, password });
        setBusy(true);
        const result = await post<unknown>("/api/v1/auth/login", parsed).catch(() => null);
        setBusy(false);

        if (result === null) { setError(MESSAGES.internal!); return; }
        if (!result.ok) { setError(visibleError(result)); return; }
        router.push(destination);
        router.refresh();
    }

    if (mode === "forgot" && sent) {
        return (
            <div className={`${PANEL} text-center`} aria-live="polite">
                <PanelHeader
                    title="Check your email"
                    blurb="The link lasts one hour."
                />
                <p className="mt-5 text-sm leading-6 text-muted-foreground">
                    If there is an account for{" "}
                    <span className="font-medium text-foreground">{email}</span>, we have sent a
                    link to set a new password.
                </p>
                <button
                    type="button"
                    onClick={() => switchTo("signin")}
                    className="mt-6 rounded-md text-sm font-medium text-brand-ink underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Back to sign in
                </button>
            </div>
        );
    }

    const copy = COPY[mode];

    return (
        <form onSubmit={handleSubmit} noValidate className={PANEL}>
            <PanelHeader title={copy.title} blurb={copy.blurb} />

            {mode !== "forgot" && (
                <>
                    <a
                        href={`/api/v1/auth/google?next=${encodeURIComponent(destination)}`}
                        className="mt-7 flex h-13 w-full items-center justify-center gap-3 rounded-lg border border-primary/40 bg-transparent px-4 text-base font-semibold text-foreground transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                        <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="#4285F4" d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.57Z" />
                            <path fill="#34A853" d="M12 23.5c3.1 0 5.71-1.03 7.62-2.78l-3.72-2.9c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.540-2.02-6.45-4.74H1.7v2.99A11.5 11.5 0 0 0 12 23.5Z" />
                            <path fill="#FBBC05" d="M5.55 14.18a6.9 6.9 0 0 1 0-4.36V6.83H1.7a11.5 11.5 0 0 0 0 10.34l3.85-3Z" />
                            <path fill="#EA4335" d="M12 4.75c1.69 0 3.2.58 4.4 1.72l3.3-3.29C17.7 1.26 15.1.5 12 .5A11.5 11.5 0 0 0 1.7 6.83l3.85 2.99C6.46 7.1 9 4.75 12 4.75Z" />
                        </svg>
                        Continue with Google
                    </a>

                    <div className="mt-7 flex items-center gap-4" aria-hidden="true">
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-xs uppercase tracking-widest text-muted-foreground">
                            or continue with email
                        </span>
                        <span className="h-px flex-1 bg-border" />
                    </div>
                </>
            )}

            {mode === "signup" && (
                <div className="mt-7">
                    <label htmlFor="name" className={LABEL}>Full name</label>
                    <Input
                        id="name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        inputSize="lg"
                        placeholder="Jane Doe"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-2"
                    />
                </div>
            )}

            <div className={mode === "signup" ? "mt-5" : "mt-7"}>
                <label htmlFor="email" className={LABEL}>Email</label>
                <Input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    inputSize="lg"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "auth-error" : undefined}
                    className="mt-2"
                    required
                />
            </div>

            {mode !== "forgot" && (
                <PasswordField
                    id="password"
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    describedBy={mode === "signup" ? "password-hint" : undefined}
                    invalid={Boolean(error)}
                    inputSize="lg"
                />
            )}

            {mode === "signup" && (
                <>
                    <p id="password-hint" className="mt-2 text-xs text-muted-foreground">
                        At least {MIN_PASSWORD_LENGTH} characters. A short phrase you will remember works well.
                    </p>
                    <PasswordField
                        id="confirmPassword"
                        label="Confirm password"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        autoComplete="new-password"
                        invalid={Boolean(error)}
                        inputSize="lg"
                    />
                </>
            )}

            <div aria-live="polite">
                {error && <p id="auth-error" className="mt-4 text-sm text-destructive">{error}</p>}
            </div>

            <Button
                type="submit"
                variant="brand"
                size="xl"
                className="mt-7 w-full rounded-lg text-base font-semibold"
                disabled={busy}
            >
                {busy ? "Just a moment…" : copy.action}
                {!busy && <ArrowRight aria-hidden />}
            </Button>

            {mode === "signup" && (
                <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
                    By signing up, you agree to our Terms of Service and Privacy Policy.
                </p>
            )}

            <div className="mt-5 flex flex-col items-center gap-1.5 text-sm text-muted-foreground">
                {mode === "signin" && (
                    <>
                        <button type="button" onClick={() => switchTo("forgot")} className="font-medium text-brand-ink underline underline-offset-4">
                            Forgot your password?
                        </button>
                        <span>
                            New here?{" "}
                            <Link href={`/signup${nextQs}`} className="font-medium text-brand-ink underline underline-offset-4">
                                Create an account
                            </Link>
                        </span>
                    </>
                )}
                {mode === "signup" && (
                    <span>
                        Already have an account?{" "}
                        <Link href={`/signin${nextQs}`} className="font-medium text-primary underline underline-offset-4">
                            Sign in
                        </Link>
                    </span>
                )}
                {mode === "forgot" && (
                    <button type="button" onClick={() => switchTo("signin")} className="font-medium text-primary underline underline-offset-4">
                        Back to sign in
                    </button>
                )}
            </div>
        </form>
    );
}
