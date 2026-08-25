import "server-only";
import { ApiError } from "@/lib/errors/respond";

export const MAX_BODY_BYTES = 64 * 1024;

/**
 * What a whole site may weigh on the wire.
 *
 * A generated site is a file tree, not a form: nine pages, each carrying its own inline
 * stylesheet, is 120 KB for the plainest look and more for the animated one. The real limit
 * on a site is MAX_TEXT_BYTES (2 MB) in validate-file-map, and that is the one that should
 * decide — it knows what it is measuring and says so. A 64 KB transport guard sitting in
 * front of it rejected every generated site with "That request is too large" before the rule
 * that actually governs sites was ever consulted.
 *
 * Headroom over 2 MB is for JSON: quoting, escaping and the path keys around the content.
 */
export const MAX_SITE_BODY_BYTES = 3 * 1024 * 1024;

export function tooLarge(headers: Headers, raw?: string, limit = MAX_BODY_BYTES): boolean {
  const declared = Number(headers.get("content-length") ?? 0);

  if (Number.isFinite(declared) && declared > limit) return true;

  return raw !== undefined && raw.length > limit;
}

export async function readJson(req: Request, limit = MAX_BODY_BYTES): Promise<unknown> {
  if (tooLarge(req.headers, undefined, limit)) {
    throw new ApiError("payload_too_large", "That request is too large.");
  }

  const raw = await req.text().catch(() => "");

  if (tooLarge(req.headers, raw, limit)) {
    throw new ApiError("payload_too_large", "That request is too large.");
  }

  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
