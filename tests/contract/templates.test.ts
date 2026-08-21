import { describe, expect, it, vi } from "vitest";

import { CATEGORIES } from "@/lib/ai/schemas";
import { TEMPLATES } from "@/lib/templates";
import { responseSchema, spec, validate } from "../support/openapi";

// GET /templates and GET /templates/{id} against the spec (R2 D6).
//
// The gallery is public, so these routes take the "none" auth path — but withRoute still
// reaches for a Supabase client to build one, and there is no database here.
vi.mock("@/lib/auth/session", () => ({
    requireUser: vi.fn(),
    supabaseRoute: vi.fn(async () => ({})),
}));

const get = async (url: string) => {
    const { GET } = await import("@/app/api/v1/templates/route");
    const response = await GET(new Request(`http://localhost${url}`) as never);
    return { status: response.status, body: await response.json() };
};

const getOne = async (id: string) => {
    const { GET } = await import("@/app/api/v1/templates/[id]/route");
    const response = await GET(new Request(`http://localhost/api/v1/templates/${id}`) as never, {
        params: Promise.resolve({ id }),
    } as never);
    return { status: response.status, body: await response.json() };
};

describe("the spec describes the library the code ships", () => {
    it("documents every category the frozen enum holds", () => {
        const documented = spec.components.schemas.Category!.enum as string[];
        expect([...documented].sort()).toEqual([...CATEGORIES].sort());
    });

    it("documents both discovery routes", () => {
        expect(spec.paths["/templates"]).toBeDefined();
        expect(spec.paths["/templates/{templateId}"]).toBeDefined();
    });
});

describe("GET /templates", () => {
    const path = "/templates";

    it("answers with the documented list envelope", async () => {
        const { status, body } = await get("/api/v1/templates");

        expect(status).toBe(200);
        expect(validate(responseSchema(path, "get", 200), body)).toEqual([]);
        expect(body.data.items).toHaveLength(TEMPLATES.length);
        expect(body.data.total).toBe(TEMPLATES.length);
    });

    it("never sends a file body — a gallery is not a download", async () => {
        const { body } = await get("/api/v1/templates");
        const serialised = JSON.stringify(body);

        expect(serialised).not.toContain("<!doctype html>");
        expect(serialised).not.toContain("data-slot=");
    });

    it("prices every tile, so no design reaches a person unpriced (UI Spec §7.5)", async () => {
        const { body } = await get("/api/v1/templates");

        for (const item of body.data.items) {
            expect(["free", "premium", "signature"]).toContain(item.tier);
            expect(item.priceInr).toBe({ free: 0, premium: 499, signature: 999 }[item.tier as "free"]);
        }
    });

    it("filters by category, and total still reports the whole library", async () => {
        const { body } = await get("/api/v1/templates?category=store");

        expect(body.data.items.length).toBeGreaterThan(0);
        expect(body.data.items.every((t: { category: string }) => t.category === "store")).toBe(true);
        expect(body.data.total).toBe(TEMPLATES.length);
    });

    it("filters by tier, colour, layout and feature", async () => {
        const free = await get("/api/v1/templates?tier=free");
        expect(free.body.data.items.every((t: { tier: string }) => t.tier === "free")).toBe(true);

        const dark = await get("/api/v1/templates?colour=dark");
        expect(dark.body.data.items.every((t: { colour: string }) => t.colour === "dark")).toBe(true);

        const split = await get("/api/v1/templates?layout=split");
        expect(split.body.data.items.every((t: { layout: string }) => t.layout === "split")).toBe(true);

        const forms = await get("/api/v1/templates?feature=form");
        expect(forms.body.data.items.length).toBeGreaterThan(0);
        expect(
            forms.body.data.items.every((t: { features: string[] }) => t.features.includes("form")),
        ).toBe(true);
    });

    it("combines filters rather than widening on the second one", async () => {
        const one = await get("/api/v1/templates?tier=free");
        const two = await get("/api/v1/templates?tier=free&colour=dark");

        expect(two.body.data.items.length).toBeLessThanOrEqual(one.body.data.items.length);
    });

    it("searches names, descriptions and tags, and narrows on a second word", async () => {
        const one = await get("/api/v1/templates?q=shop");
        expect(one.body.data.items.length).toBeGreaterThan(0);

        const two = await get("/api/v1/templates?q=shop%20nonsense");
        expect(two.body.data.items).toHaveLength(0);
    });

    it("answers an impossible filter with an empty list, not an error", async () => {
        // Free tiles are light-only now, so free + dark is empty.
        const { status, body } = await get("/api/v1/templates?tier=free&colour=dark");

        expect(status).toBe(200);
        expect(validate(responseSchema(path, "get", 200), body)).toEqual([]);
        expect(body.data.items).toEqual([]);
    });

    it("ignores values it does not recognise instead of refusing them (D-4, FR-035)", async () => {
        const { status, body } = await get(
            "/api/v1/templates?category=__proto__&tier=cheap&colour=chartreuse&sort=random",
        );

        expect(status).toBe(200);
        expect(body.data.items).toHaveLength(TEMPLATES.length);
    });

    it("orders by the deterministic score when a description was classified", async () => {
        const { body } = await get("/api/v1/templates?intent=store&tone=warm&palette=light");
        const scores = body.data.items.map((t: { score: number }) => t.score);

        expect(body.data.items[0].category).toBe("store");
        expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
    });

    it("gives the same answer twice — the order is stable across requests (D-5)", async () => {
        const first = await get("/api/v1/templates?intent=food&tone=warm&palette=dark");
        const second = await get("/api/v1/templates?intent=food&tone=warm&palette=dark");

        expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
    });

    it("scores zero for everything when nothing was described", async () => {
        const { body } = await get("/api/v1/templates");
        expect(body.data.items.every((t: { score: number }) => t.score === 0)).toBe(true);
    });

    it("lets an explicit sort outrank the score", async () => {
        const { body } = await get("/api/v1/templates?intent=store&sort=name");
        const names = body.data.items.map((t: { name: string }) => t.name);

        expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));
    });
});

describe("GET /templates/{id}", () => {
    const path = "/templates/{templateId}";

    it("answers with the documented detail envelope", async () => {
        const { status, body } = await getOne("shop");

        expect(status).toBe(200);
        expect(validate(responseSchema(path, "get", 200), body)).toEqual([]);
    });

    it("holds every design in the library to that shape", async () => {
        for (const template of TEMPLATES) {
            const { body } = await getOne(template.id);
            expect(validate(responseSchema(path, "get", 200), body), template.id).toEqual([]);
        }
    });

    it("answers a retired design with the documented failure envelope", async () => {
        const { status, body } = await getOne("no-such-design");

        expect(status).toBe(404);
        expect(validate(responseSchema(path, "get", "default"), body)).toEqual([]);
        expect(body.error.code).toBe("not_found");
    });
});
