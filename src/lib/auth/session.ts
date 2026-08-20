import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { ApiError } from '@/lib/errors/respond';

export async function supabaseRoute() {
  const store = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          for (const { name, value, options } of list) {
            store.set(name, value, options);
          }
        },
      },
    },
  );
}

export async function requireUser() {
  const supabase = await supabaseRoute();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new ApiError('unauthorized', 'Please sign in.');
  }

  return {
    supabase,
    userId: data.user.id,
    email: (data.user.email ?? "").trim().toLowerCase(),
  };
}
import "server-only";
import type { User } from "@supabase/supabase-js";
import { supabaseRouteClient, supabaseViewerClient } from "@/lib/auth/server";

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
  const supabase = await supabaseRouteClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  return toSessionUser(data.user);
}

// What the app shell needs: the session user plus the name to greet them by.
export type Viewer = SessionUser & { name: string };

// The name the sign-up panel collected, falling back to the local part of the email
// so the shell always has something human to show.
export function toViewer(user: User): Viewer {
  const session = toSessionUser(user);
  const fullName = user.user_metadata?.full_name;
  const name = typeof fullName === "string" ? fullName.trim() : "";

  return { ...session, name: name || session.email.split("@")[0] || "Your account" };
}

// The signed-in user as seen from a Server Component — who to show in the app shell.
// Signed out is an ordinary answer here, not an error: several screens are public.
export async function viewer(): Promise<Viewer | null> {
  const supabase = await supabaseViewerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  return toViewer(data.user);
}
