import "server-only";
import type { User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/errors/respond";
import { supabaseRouteClient, supabaseViewerClient } from "@/lib/auth/server";

/**
 * Session-scoped Supabase client for Route Handlers.
 *
 * Kept as `supabaseRoute` because `withRoute` and the contract tests import that name.
 * Cookie writes go through `supabaseRouteClient` so login, logout and OAuth share one path.
 */
export async function supabaseRoute() {
    return supabaseRouteClient();
}

export async function requireUser() {
    const supabase = await supabaseRouteClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
        throw new ApiError("unauthorized", "Please sign in.");
    }

  return {
    supabase,
    userId: data.user.id,
    email: (data.user.email ?? "").trim().toLowerCase(),
  };
}

export type SessionUser = {
    id: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
};

export function toSessionUser(user: User): SessionUser {
    return {
        id: user.id,
        email: user.email ?? "",
        emailVerified: user.email_confirmed_at !== null && user.email_confirmed_at !== undefined,
        createdAt: user.created_at,
    };
}

export async function currentUser(): Promise<SessionUser | null> {
    try {
        const supabase = await supabaseRouteClient();
        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) return null;

        return toSessionUser(data.user);
    } catch {
        return null;
    }
}

export type Viewer = SessionUser & { name: string };

export function toViewer(user: User): Viewer {
    const session = toSessionUser(user);
    const fullName = user.user_metadata?.full_name;
    const name = typeof fullName === "string" ? fullName.trim() : "";

    return { ...session, name: name || session.email.split("@")[0] || "Your account" };
}

// The signed-in user as seen from a Server Component — who to show in the app shell.
// Signed out is an ordinary answer here, not an error: several screens are public.
export async function viewer(): Promise<Viewer | null> {
    try {
        const supabase = await supabaseViewerClient();
        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) return null;

        return toViewer(data.user);
    } catch {
        return null;
    }
}
