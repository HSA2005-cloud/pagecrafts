import "server-only";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";

import { requireUser, supabaseRoute } from "@/lib/auth/session";
import { fail, isApiError, UNEXPECTED_FAILURE } from "@/lib/errors/respond";
import { guardAiRequest, type UsageReport } from "@/lib/limits/ai-guard";
import { readJson } from "./body";
import { captureError } from "@/lib/observability/capture";


export interface RouteContext<Body, Params> {
  req: NextRequest;
  params: Params;
  body: Body;
  userId: string; // "" when auth is "none"
  email: string; // "" when auth is "none" or the session has no address
  supabase: SupabaseClient; // scoped to the session, so RLS applies
  recordUsage: (usage: UsageReport) => Promise<void>; // no-op unless limit is "ai"
}

export interface RouteOptions<Body, Params> {
  auth?: "required" | "none";
  schema?: ZodType<Body>;
  limit?: "ai";
  /** Bytes this route may accept. Defaults to MAX_BODY_BYTES; a whole site needs more. */
  maxBodyBytes?: number;
  handler: (ctx: RouteContext<Body, Params>) => Promise<Response>;
}

export function withRoute<
  Body = undefined,
  Params extends Record<string, string | string[]> = Record<string, never>,
>(opts: RouteOptions<Body, Params>) {
  return async (
    req: NextRequest,
    segment?: { params: Promise<Params> },
  ): Promise<Response> => {
    try {
      const params = segment ? await segment.params : ({} as Params);

      let userId = "";
      let email = "";
      let supabase: SupabaseClient;
      if (opts.auth === "none") {
        supabase = await supabaseRoute();
      } else {
        // Throws ApiError('unauthorized') when there is no session.
        const session = await requireUser();
        userId = session.userId;
        email = session.email ?? "";
        supabase = session.supabase;
      }

      let body = undefined as Body;
      if (opts.schema) {
        const json = await readJson(req, opts.maxBodyBytes);

        const parsed = opts.schema.safeParse(json);
        if (!parsed.success) {
          console.warn("[api] rejected body", {
            path: new URL(req.url).pathname,
            issues: parsed.error.issues.map((i) => i.path.join(".")),
            reasons: parsed.error.issues.map((i) => i.message),
          });
          return fail("validation_failed", "Some fields were invalid.");
        }
        body = parsed.data;
      }

      const noUsage = async () => {};

      if (opts.limit !== "ai") {
        return await opts.handler({ req, params, body, userId, email, supabase, recordUsage: noUsage });
      }

      const guard = await guardAiRequest(userId, req.headers);

      if (!guard.ok) return guard.response;

      try {
        return await opts.handler({
          req, params, body, userId, email, supabase,
          recordUsage: guard.recordUsage,
        });
      } finally {
        await guard.release();
      }
    } catch (err) {
      if (isApiError(err)) return fail(err.code, err.message, err.detail);

      captureError(err, {
        tags: { boundary: "route" },
        extra: { path: new URL(req.url).pathname },
      });
      console.error("[api]", err);

      return fail("internal", UNEXPECTED_FAILURE);
    }
  };
}
