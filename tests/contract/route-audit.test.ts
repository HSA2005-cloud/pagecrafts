import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The route audit (R3 D19).
//
// "Every owner route RLS-scoped, every input Zod-validated, every response in the envelope.
// There is a test for each of these already; the audit is confirming no route added since
// escaped them."
//
// The escaping is the whole problem. Each existing test names the route it covers, so a
// route nobody thought about is covered by nothing and looks exactly like a route that
// passed. This starts from the filesystem instead: every route.ts under src/app/api has to
// be accounted for here, and a new one fails the build until somebody says what it is.
//
// What it cannot check is whether a handler *uses* the client it was given correctly — that
// is tests/contract/cross-user-routes.test.ts, which enumerates the same way for the same
// reason.

const API = join(process.cwd(), "src", "app", "api");

function routeFiles(dir = API, prefix = ""): { path: string; source: string }[] {
    const found: { path: string; source: string }[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            found.push(...routeFiles(full, `${prefix}/${entry}`));
        } else if (entry === "route.ts") {
            found.push({ path: prefix || "/", source: readFileSync(full, "utf8") });
        }
    }
    return found.sort((a, b) => a.path.localeCompare(b.path));
}

const ROUTES = routeFiles();

/**
 * Routes that deliberately do not go through withRoute, and why.
 *
 * withRoute is what makes auth, Zod validation, the error envelope and the AI guard
 * automatic. Anything outside it has all of those as somebody's responsibility to remember,
 * so the list is short and each entry has to earn its place.
 */
const NOT_WITH_ROUTE: Record<string, string> = {
    "/v1/auth/callback": "An OAuth redirect. It answers with a Location, not a body.",
    "/v1/auth/confirm": "An emailed link. Redirects; there is no JSON for an envelope to wrap.",
    "/v1/auth/google": "Starts the OAuth dance. Redirects to the provider.",
    "/v1/auth/login": "Pre-session by definition; uses guard() for the envelope.",
    "/v1/auth/logout": "Pre-session by definition; uses guard() for the envelope.",
    "/v1/auth/me": "Answers for a session that may not exist; uses guard().",
    "/v1/auth/password/reset": "Pre-session; uses guard().",
    "/v1/auth/password/update": "Pre-session; uses guard().",
    "/v1/auth/signup": "Pre-session by definition; uses guard().",
    "/v1/auth/pending":
        "Pre-session by definition -- it exists to answer somebody who has no session "
        + "yet. Uses guard() for the envelope.",
    "/v1/auth/verify/resend": "Pre-session; uses guard().",
    "/v1/health": "A liveness probe. Its shape is for a monitor, not a person.",
    "/v1/payments/razorpay/webhook":
        "The caller is Razorpay, not a signed-in person. Authentication is an HMAC over the " +
        "raw bytes, and the status codes are instructions to their retry logic.",
};

/** Routes with a write method and no Zod schema, and why that is right. */
const NO_SCHEMA: Record<string, string> = {
    "/v1/projects/[id]/assets":
        "multipart/form-data. The body is parsed and checked in the handler — size, mime " +
        "type — because a Zod schema cannot describe a file upload.",
    "/v1/account/billing/downgrade":
        "No body. Switching to Starter is a session-scoped revoke, not a payload.",
    "/v1/projects/[id]/publish": "No body. The idempotency key is a header, checked in the route.",
    "/v1/account":
        "DELETE body is email + password, checked with readCredentials / authenticateWithPassword " +
        "in the handler (same as deleting a site) rather than a withRoute Zod schema — a stolen " +
        "cookie alone must not wipe the account. The UI still shows what they lose and asks them " +
        "to type the words. PATCH /account/consent, which does carry a body, has its schema.",
    "/v1/payments/razorpay/verify":
        "Handled directly by verifying razorpay_order_id, razorpay_payment_id and razorpay_signature in handler.",
};

/** Routes allowed to reach past RLS with the service role, and why. */
const ADMIN_CLIENT = {
    "/v1/auth/pending":
        "Reads one auth user to ask whether their email is confirmed, then mints a one-time " +
        "link for that same user. There is no session yet, so there is no user-scoped client " +
        "to use instead. Which user is not taken from the request: it comes from an httpOnly " +
        "HMAC-signed ticket set at signup, so the route can only ever act on the account the " +
        "holder of that cookie created.",
    "/v1/health": "Checks the database is reachable at all, which is not a per-user question.",
    "/v1/projects/[id]/generate":
        "Only to hand the vertical-profile cache a writer. Profiles are shared reference " +
        "data written by no user; the project work stays on the caller's own client.",
    "/v1/pay/[id]":
        "Public shop pay page. The visitor is not the owner, so the session client cannot " +
        "read site_meta.upiId under RLS; the handler returns only the UPI id and business " +
        "name, never email or other account fields.",
};

const usesWithRoute = (source: string) => /withRoute[<(]/.test(source);
const hasWriteMethod = (source: string) =>
    /export\s+(?:const|async\s+function)\s+(POST|PUT|PATCH|DELETE)\b/.test(source);
const declaresSchema = (source: string) => /\bschema\s*[,:]/.test(source);

describe("every route is accounted for", () => {
    it("found the routes at all", () => {
        // A glob that silently matches nothing is the classic way for an audit like this to
        // pass forever.
        expect(ROUTES.length).toBeGreaterThan(30);
    });

    it("goes through withRoute, or says in writing why not", () => {
        const escaped = ROUTES.filter(
            (r) => !usesWithRoute(r.source) && !(r.path in NOT_WITH_ROUTE),
        ).map((r) => r.path);

        expect(escaped).toEqual([]);
    });

    it("does not carry exemptions for routes that no longer exist", () => {
        const live = new Set(ROUTES.map((r) => r.path));
        const stale = [
            ...Object.keys(NOT_WITH_ROUTE),
            ...Object.keys(NO_SCHEMA),
            ...Object.keys(ADMIN_CLIENT),
        ].filter((p) => !live.has(p));

        expect(stale).toEqual([]);
    });

    it("does not exempt a route that in fact uses withRoute", () => {
        // An exemption nobody needs is an exemption nobody rechecks.
        const unnecessary = Object.keys(NOT_WITH_ROUTE).filter((p) =>
            usesWithRoute(ROUTES.find((r) => r.path === p)!.source),
        );

        expect(unnecessary).toEqual([]);
    });
});

describe("input validation", () => {
    it("gives every write route a Zod schema, or says in writing why not", () => {
        const unvalidated = ROUTES.filter(
            (r) =>
                usesWithRoute(r.source) &&
                hasWriteMethod(r.source) &&
                !declaresSchema(r.source) &&
                !(r.path in NO_SCHEMA),
        ).map((r) => r.path);

        expect(unvalidated).toEqual([]);
    });

    it("never reads the body directly past the schema", () => {
        // req.json() inside a withRoute handler is the body arriving unvalidated. /assets is
        // the one place it is right, and it is listed above with the reason.
        const raw = ROUTES.filter(
            (r) =>
                usesWithRoute(r.source) &&
                /\breq\.json\(\)|\brequest\.json\(\)/.test(r.source) &&
                !(r.path in NO_SCHEMA),
        ).map((r) => r.path);

        expect(raw).toEqual([]);
    });
});

describe("row security", () => {
    it("reaches past RLS only where the audit has agreed it may", () => {
        const bypassing = ROUTES.filter(
            (r) => /supabaseAdmin|SERVICE_ROLE/.test(r.source) && !(r.path in ADMIN_CLIENT),
        ).map((r) => r.path);

        // The service-role client has BYPASSRLS. A route holding one is a route where
        // ownership is nobody's job unless the handler makes it its job.
        expect(bypassing).toEqual([]);
    });

    it("never trusts a user id from the request", () => {
        // The id comes from the verified session, via withRoute. A route reading one out of
        // the body or the query is a route anybody can act as anybody through.
        const offenders = ROUTES.filter((r) =>
            /searchParams\.get\(\s*['"]user_?[iI]d['"]\s*\)|body\.user_?[iI]d/.test(r.source),
        ).map((r) => r.path);

        expect(offenders).toEqual([]);
    });
});

describe("the runtime declarations every route needs", () => {
    it("pins the Node runtime and opts out of caching", () => {
        // A route that is statically rendered answers the first caller's data to everyone
        // after them, which on an owner-scoped route is the worst bug available.
        const missing = ROUTES.filter(
            (r) =>
                !/export const runtime = ['"]nodejs['"]/.test(r.source) ||
                !/export const dynamic = ['"]force-dynamic['"]/.test(r.source),
        ).map((r) => r.path);

        expect(missing).toEqual([]);
    });
});
