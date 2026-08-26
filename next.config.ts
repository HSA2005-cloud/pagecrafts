import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { securityHeaders, NO_STORE } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // blake3-wasm / @noble/hashes: Cloudflare Pages Direct Upload hashes with blake3.
  // Turbopack cannot resolve those packages' ESM/`exports` entry points when bundling
  // (blake3-wasm's `module` field is broken; @noble/hashes subpaths like
  // `@noble/hashes/blake3.js` fail the same way). Listing them here keeps Next from
  // bundling them — Node loads them at runtime instead. Cannot swap for node:crypto:
  // Cloudflare deduplicates by blake3 specifically.
  //
  // sharp is here for a different reason: it is a native module, and bundling a native
  // module is not a thing that works. It recompresses the photographs Gemini draws for a
  // generated site (lib/images/site-photos.ts) before they are stored — a megabyte and a
  // half of PNG becomes a couple of hundred kilobytes of WebP, which is the difference
  // between a fast published site and a slow one on a phone.
  serverExternalPackages: ["@noble/hashes", "blake3-wasm", "sharp"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
      {
        source: "/api/:path*",
        headers: NO_STORE,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  telemetry: false,
});
