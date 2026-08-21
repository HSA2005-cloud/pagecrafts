export interface HeaderRule {
    key: string;
    value: string;
}

const SUPABASE_ORIGIN = (() => {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

    try {
        return raw ? new URL(raw).origin : "";
    } catch {
        return "";
    }
})();

const SENTRY_ORIGIN = (() => {
    const raw = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

    try {
        return raw ? new URL(raw).origin : "";
    } catch {
        return "";
    }
})();

const POSTHOG_ORIGIN = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "";

function origins(...values: string[]): string {
    return [...new Set(values.filter(Boolean))].join(" ");
}

export function contentSecurityPolicy(isDev = process.env.NODE_ENV !== "production"): string {
    const connect = origins(
        "'self'",
        SUPABASE_ORIGIN,
        SENTRY_ORIGIN,
        POSTHOG_ORIGIN,
        SUPABASE_ORIGIN ? SUPABASE_ORIGIN.replace(/^https:/, "wss:") : "",
        isDev ? "ws://localhost:*" : "",
    );

    const directives = [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com${isDev ? " 'unsafe-eval'" : ""}`,
        "style-src 'self' 'unsafe-inline'",
        origins("img-src 'self' data: blob: https://images.unsplash.com", SUPABASE_ORIGIN),
        "font-src 'self' data:",
        `connect-src ${connect} https://lumberjack.razorpay.com https://api.razorpay.com https://checkout.razorpay.com`,
        "frame-src 'self' blob: https://api.razorpay.com https://api.razorpay.in https://checkout.razorpay.com",
        "object-src 'none'",
        "base-uri 'self'",
        // Card 3DS opens about:blank then POSTs that window to Razorpay or a bank ACS.
        // Restricting this to 'self' leaves the new tab blank. javascript: and data: stay out.
        "form-action 'self' https:",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
    ];

    return directives.join("; ");
}

export function securityHeaders(
    isDev = process.env.NODE_ENV !== "production",
): HeaderRule[] {
    const rules: HeaderRule[] = [
        { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
        },
        // same-origin severs window.opener, so Razorpay's card 3DS popup opens as
        // about:blank#blocked. allow-popups keeps isolation without killing checkout.
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        { key: "X-DNS-Prefetch-Control", value: "off" },
    ];

    if (!isDev) {
        rules.push({
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
        });
    }

    return rules;
}

export const NO_STORE: HeaderRule[] = [
    { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
    { key: "Pragma", value: "no-cache" },
];
