import "server-only";
import { supabaseRoute, toSessionUser } from "@/lib/auth/session";
import { resolvePlan } from "@/lib/data/entitlements";
import { ok, fail, guard } from "@/lib/errors/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return guard(async () => {
    const supabase = await supabaseRoute();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return fail("unauthorized", "Sign in to continue.");
    }

    // The current plan comes from the database (entitlements), never the client, and rides
    // along with the identity so the shell can show it without a second round trip.
    const plan = await resolvePlan(supabase, data.user.id);

    return ok({ user: toSessionUser(data.user), plan });
  });
}
