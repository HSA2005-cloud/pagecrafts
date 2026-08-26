import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "../support/fake-db";

// R3 D14 — the post-publish edit gate, on every write path rather than at one call site.
//
// D13 built the rule; nothing called it, so it protected nothing. A gate applied to one
// route out of four is not a gate — somebody reaches the site through the file API instead
// of the content API and the rule may as well not exist. These tests go through the real
// route handlers, one per path, because that is the level the rule has to hold at.

const auth = vi.hoisted(() => ({ requireUser: vi.fn(), supabaseRoute: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
    requireUser: auth.requireUser,
    supabaseRoute: auth.supabaseRoute,
}));

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function liveSite(publishedAt: string) {
    const db = createFakeDb({ users: [{ id: "u1" }] });
    const project = db.insert("projects", {
        user_id: "u1",
        name: "Kettle & Co.",
        content_json: { hero: { headline: "Hi" } },
        content_schema: {
            sections: [{ key: "hero", label: "Hero", fields: [{ key: "headline", label: "H", type: "text" }] }],
        },
    });
    const id = project.id as string;

    db.insert("project_files", { project_id: id, path: "index.html", content: "<h1>Hi</h1>" });
    db.insert("deployments", {
        project_id: id,
        status: "live",
        live_url: "https://kettle.pagecraft.in",
        created_at: publishedAt,
        updated_at: publishedAt,
    });

    auth.requireUser.mockResolvedValue({ userId: "u1", supabase: db.asUser("u1") });
    auth.supabaseRoute.mockResolvedValue(db.asUser("u1"));
    return { db, id };
}

const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init) as never;
const body = (method: string, payload: unknown) => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
});

beforeEach(() => vi.clearAllMocks());

/** Every route that changes what the published site would say. */
const writePaths = [
    {
        name: "PUT /files",
        run: async (id: string) => {
            const { PUT } = await import("@/app/api/v1/projects/[id]/files/route");
            return PUT(
                req(`/api/v1/projects/${id}/files`, body("PUT", { files: { "index.html": "<h1>New</h1>" } })),
                { params: Promise.resolve({ id }) } as never,
            );
        },
    },
    {
        name: "PUT /files/{path}",
        run: async (id: string) => {
            const { PUT } = await import("@/app/api/v1/projects/[id]/files/[...path]/route");
            return PUT(
                req(`/api/v1/projects/${id}/files/index.html`, body("PUT", { content: "<h1>New</h1>" })),
                { params: Promise.resolve({ id, path: ["index.html"] }) } as never,
            );
        },
    },
    {
        name: "DELETE /files/{path}",
        run: async (id: string) => {
            const { DELETE } = await import("@/app/api/v1/projects/[id]/files/[...path]/route");
            return DELETE(
                req(`/api/v1/projects/${id}/files/index.html`, { method: "DELETE" }),
                { params: Promise.resolve({ id, path: ["index.html"] }) } as never,
            );
        },
    },
    {
        name: "PATCH /content",
        run: async (id: string) => {
            const { PATCH } = await import("@/app/api/v1/projects/[id]/content/route");
            return PATCH(
                req(`/api/v1/projects/${id}/content`, body("PATCH", { ops: [{ path: "hero.headline", value: "New" }] })),
                { params: Promise.resolve({ id }) } as never,
            );
        },
    },
];

describe("a live site, long past the goodwill window", () => {
    for (const path of writePaths) {
        it(`${path.name} is refused without an unlock`, async () => {
            const { id } = liveSite(ago(60 * DAY));

            const response = await path.run(id);
            const payload = await response.json();

            expect(response.status, path.name).toBe(402);
            expect(payload.ok).toBe(false);
            expect(payload.error.code).toBe("payment_required");
        });
    }
});

describe("a live site, even just published", () => {
    // GOODWILL_WINDOW_DAYS is 0: first publish is free, further edits need Rs 249 unlock.
    for (const path of writePaths) {
        it(`${path.name} is refused without an unlock`, async () => {
            const { id } = liveSite(ago(2 * DAY));

            const response = await path.run(id);
            const payload = await response.json();

            expect(response.status, path.name).toBe(402);
            expect(payload.ok).toBe(false);
            expect(payload.error.code).toBe("payment_required");
        });
    }
});

describe("a site nobody has published", () => {
    it("is editable, because a draft is not gated at all", async () => {
        const db = createFakeDb({ users: [{ id: "u1" }] });
        const project = db.insert("projects", { user_id: "u1", name: "Draft", content_json: {} });
        auth.requireUser.mockResolvedValue({ userId: "u1", supabase: db.asUser("u1") });
        auth.supabaseRoute.mockResolvedValue(db.asUser("u1"));

        const { PUT } = await import("@/app/api/v1/projects/[id]/files/route");
        const response = await PUT(
            req(`/api/v1/projects/${project.id}/files`, body("PUT", { files: { "index.html": "<h1>Hi</h1>" } })),
            { params: Promise.resolve({ id: project.id as string }) } as never,
        );

        expect(response.status).toBeLessThan(400);
    });
});

describe("with an unlock bought", () => {
    it("the live site can be edited again", async () => {
        const { db, id } = liveSite(ago(60 * DAY));
        db.insert("entitlements", {
            user_id: "u1",
            project_id: id,
            kind: "edit_unlock",
            source: "paid",
            status: "active",
        });

        const { PATCH } = await import("@/app/api/v1/projects/[id]/content/route");
        const response = await PATCH(
            req(`/api/v1/projects/${id}/content`, body("PATCH", { ops: [{ path: "hero.headline", value: "New" }] })),
            { params: Promise.resolve({ id }) } as never,
        );

        expect(response.status).toBeLessThan(400);
    });
});

export type { FakeDb };
