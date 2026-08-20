import Link from "next/link";
import { ResendVerification } from "@/components/auth/ResendVerification";

export default async function VerifyPage({
    searchParams,
}: {
    searchParams: Promise<{ email?: string }>;
}) {
    const { email } = await searchParams;

    return (
        <main className="flex flex-1 items-center justify-center px-6 py-16">
            <div data-reveal className="w-full max-w-sm rounded-2xl glass-panel p-6 text-center">
                <h1 className="text-lg font-semibold text-card-foreground">Confirm your email</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    If this is a new email account, we send a confirmation link to{" "}
                    <span className="font-medium text-foreground">{email ?? "your email address"}</span>.
                    Tap it and you are ready to build.
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    If you already used Continue with Google with this address, you will not get this email. Sign in with Google instead.
                </p>
                {email && <ResendVerification email={email} />}
                <div className="mt-5 flex flex-col gap-2 text-sm">
                    <a
                        href="/api/v1/auth/google"
                        className="font-medium text-brand-ink underline underline-offset-4"
                    >
                        Continue with Google
                    </a>
                    <Link
                        href="/?mode=signin#sign-in"
                        className="font-medium text-muted-foreground underline underline-offset-4"
                    >
                        Sign in with email and password
                    </Link>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                    Nothing arrived? Check the spam folder, then wait a minute before asking for another.
                </p>
            </div>
        </main>
    );
}
