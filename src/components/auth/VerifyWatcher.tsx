"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const EVERY_MS = 3000;
const GIVE_UP_AFTER_MS = 15 * 60 * 1000;

type Status = "waiting" | "signed_in" | "unknown";

export function VerifyWatcher() {
    const router = useRouter();
    const [gaveUp, setGaveUp] = useState(false);

    useEffect(() => {
        let stopped = false;
        const startedAt = Date.now();

        async function check() {
            if (stopped) return;

            if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
                setGaveUp(true);
                return;
            }

            try {
                const response = await fetch("/api/v1/auth/pending", { cache: "no-store" });
                const body = (await response.json()) as { ok: boolean; data?: { status: Status } };

                if (body.ok && body.data?.status === "signed_in") {
                    stopped = true;
                    router.replace("/new");
                    return;
                }
            } catch {
                // Offline, or the tab was backgrounded. Try again on the next tick.
            }

            if (!stopped) window.setTimeout(check, EVERY_MS);
        }

        void check();

        // Coming back to the tab is the most likely moment for the answer to have
        // changed, so ask immediately rather than waiting out the interval.
        const onFocus = () => void check();
        window.addEventListener("focus", onFocus);

        return () => {
            stopped = true;
            window.removeEventListener("focus", onFocus);
        };
    }, [router]);

    if (gaveUp) {
        return (
            <p className="mt-4 text-xs text-muted-foreground">
                Still waiting. If you have already confirmed, <Link href="/" className="underline">sign in here</Link>.
            </p>
        );
    }

    return (
        <p className="mt-4 text-xs text-muted-foreground" role="status">
            This page will take you in as soon as you confirm — on this device or any other.
        </p>
    );
}
