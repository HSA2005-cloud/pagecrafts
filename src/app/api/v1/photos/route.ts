import "server-only";

import { withRoute } from "@/lib/kernel/with-route";
import { ok } from "@/lib/errors/respond";
import { searchPhotos } from "@/lib/data/unsplash-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/photos?q=… — photo search for the asset picker (R2 D12).
//
// Signed in, because every call spends a share of an hourly quota that belongs to everyone
// using PageCrafts. Anonymous search would let one script exhaust it for all of them.
//
// Named `photos` rather than `unsplash`: the picker asks for pictures, and which library
// they come from is this route's business, not the client's. Swapping the provider later
// should not change a URL anybody has bookmarked or coded against.
export const GET = withRoute<undefined, Record<string, never>>({
  auth: "required",
  handler: async ({ req }) => {
    const query = new URL(req.url).searchParams.get("q") ?? "";
    return ok({ items: await searchPhotos(query) });
  },
});
