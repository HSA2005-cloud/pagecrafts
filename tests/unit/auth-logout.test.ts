import { describe, it, expect, vi, beforeEach } from "vitest";

const signOut = vi.fn();

vi.mock("@/lib/auth/server", () => ({
    supabaseRouteClient: async () => ({ auth: { signOut } }),
}));

import { POST } from "@/app/api/v1/auth/logout/route";

beforeEach(() => {
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
});

describe("POST /api/v1/auth/logout", () => {
    it("ends the provider session", async () => {
        const response = await POST();
        const payload = await response.json();

        expect(signOut).toHaveBeenCalledOnce();
        expect(response.status).toBe(200);
        expect(payload).toEqual({ ok: true, data: { signedOut: true } });
    });
});
