import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { securityHeaders, NO_STORE } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // blake3-wasm ships a broken ESM build: esm/index.js does `export * from './node.js'`
  // and no such file exists — the Node entry point is esm/node/index.js. Turbopack follows
  // the `module` field, cannot resolve it, and the whole build fails on the publish route.
  //
  // Its `main` field points at a CommonJS build that is fine. Listing it here keeps Next
  // from bundling it at all: Node requires it at runtime and picks that entry instead.
  // Cloudflare's direct upload needs blake3 specifically — it is the hash their API
  // deduplicates files by — so this cannot be swapped for node:crypto.
  //
  // sharp is here for a different reason: it is a native module, and bundling a native
  // module is not a thing that works. It recompresses the photographs Gemini draws for a
  // generated site (lib/images/site-photos.ts) before they are stored — a megabyte and a
  // half of PNG becomes a couple of hundred kilobytes of WebP, which is the difference
  // between a fast published site and a slow one on a phone.
  serverExternalPackages: ["blake3-wasm", "sharp"],
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
