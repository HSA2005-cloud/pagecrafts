/**
 * Auth email and OAuth redirect URLs.
 *
 * GoTrue only follows `emailRedirectTo` / `redirectTo` when the URL is on its
 * allow-list. The list is exact (query string included), so every URL the app
 * actually sends has to appear in `supabase/config.toml` under
 * `additional_redirect_urls` — and, on a hosted project, under Authentication →
 * URL Configuration → Redirect URLs. A missing entry is silent: the link in
 * the email falls back to Site URL and the confirm route never runs.
 */

export const AUTH_CONFIRM_PATH = '/api/v1/auth/confirm';
export const AUTH_CALLBACK_PATH = '/api/v1/auth/callback';

export type ConfirmNext = '/new' | '/reset';

function originOf(appUrl: string): string {
    const origin = appUrl.trim().replace(/\/$/, '');
    if (!origin) {
        throw new Error('NEXT_PUBLIC_APP_URL is missing — auth emails cannot build a redirect.');
    }
    return origin;
}

/** Where a confirmation or recovery email should land. */
export function authConfirmUrl(appUrl: string, next: ConfirmNext): string {
    return `${originOf(appUrl)}${AUTH_CONFIRM_PATH}?next=${next}`;
}

/** Where Google OAuth should return. */
export function authCallbackUrl(appUrl: string, next: string): string {
    return `${originOf(appUrl)}${AUTH_CALLBACK_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * The exact URLs GoTrue must allow for one origin.
 *
 * Query variants are listed because the allow-list does not treat `?next=` as
 * optional. The confirm path without a query is included so a hand-built link
 * still works; the callback glob covers `?next=` for any safe path.
 */
export function authRedirectAllowList(appUrl: string): string[] {
    const origin = originOf(appUrl);
    return [
        `${origin}${AUTH_CONFIRM_PATH}`,
        `${origin}${AUTH_CONFIRM_PATH}?next=/new`,
        `${origin}${AUTH_CONFIRM_PATH}?next=/reset`,
        `${origin}${AUTH_CALLBACK_PATH}`,
        `${origin}${AUTH_CALLBACK_PATH}**`,
    ];
}

/** Local dev uses both hostnames; cookies and pasted links mix them. */
export const LOCAL_APP_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
] as const;

export function localAuthRedirectAllowList(): string[] {
    return LOCAL_APP_ORIGINS.flatMap((origin) => authRedirectAllowList(origin));
}
