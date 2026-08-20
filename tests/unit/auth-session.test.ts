import { describe, it, expect, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

vi.mock("@/lib/auth/server", () => ({
    supabaseRouteClient: async () => ({}),
    supabaseViewerClient: async () => ({}),
}));

import { toSessionUser, toViewer } from "@/lib/auth/session";

const user = {
    id: "u1",
    email: "meera@pagecraft.test",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-02T00:00:00Z",
    user_metadata: { full_name: "Meera Shah" },
} as unknown as User;

describe("toSessionUser", () => {
    it("maps a provider user onto the session shape", () => {
        expect(toSessionUser(user)).toEqual({
            id: "u1",
            email: "meera@pagecraft.test",
            emailVerified: true,
            createdAt: "2026-01-02T00:00:00Z",
        });
    });

    it("treats a missing confirmation timestamp as unverified", () => {
        expect(toSessionUser({ ...user, email_confirmed_at: undefined }).emailVerified).toBe(false);
    });
});

describe("toViewer", () => {
    it("prefers the name collected at sign-up", () => {
        expect(toViewer(user).name).toBe("Meera Shah");
    });

    it("falls back to the local part of the email", () => {
        expect(toViewer({ ...user, user_metadata: {} }).name).toBe("meera");
    });
});
