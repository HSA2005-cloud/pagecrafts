import { describe, it, expect, vi, beforeEach } from "vitest";

const resetPasswordForEmail = vi.fn();
const getUser = vi.fn();
const updateUser = vi.fn();

vi.mock("@/lib/auth/server", () => ({
    supabaseRouteClient: async () => ({
        auth: { resetPasswordForEmail, getUser, updateUser },
    }),
}));

vi.mock("@/lib/config/env", () => ({
    publicEnv: { appUrl: "http://localhost:3000", supabaseUrl: "", supabaseAnonKey: "" },
}));

import { POST as reset } from "@/app/api/v1/auth/password/reset/route";
import { POST as update } from "@/app/api/v1/auth/password/update/route";

function request(path: string, body: unknown) {
    return new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    }) as never;
}

beforeEach(() => {
    resetPasswordForEmail.mockReset();
    getUser.mockReset();
    updateUser.mockReset();
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});

describe("POST /api/v1/auth/password/reset", () => {
    it("accepts a valid email and does not reveal whether the account exists", async () => {
        const response = await reset(request("/api/v1/auth/password/reset", {
            email: "meera@pagecraft.test",
        }));
        const payload = await response.json();

        expect(resetPasswordForEmail).toHaveBeenCalledWith(
            "meera@pagecraft.test",
            { redirectTo: "http://localhost:3000/api/v1/auth/confirm?next=/reset" },
        );
        expect(response.status).toBe(202);
        expect(payload).toEqual({ ok: true, data: { status: "accepted" } });
    });

    it("still answers 202 when the provider has never heard of the address", async () => {
        resetPasswordForEmail.mockResolvedValue({
            data: {},
            error: { code: "user_not_found", status: 404, message: "not found" },
        });

        const response = await reset(request("/api/v1/auth/password/reset", {
            email: "ghost@pagecraft.test",
        }));

        expect(response.status).toBe(202);
        expect(await response.json()).toMatchObject({ ok: true });
    });

    it("rejects a malformed email", async () => {
        const response = await reset(request("/api/v1/auth/password/reset", { email: "nope" }));
        const payload = await response.json();

        expect(resetPasswordForEmail).not.toHaveBeenCalled();
        expect(response.status).toBe(422);
        expect(payload.error.code).toBe("validation_failed");
    });
});

describe("POST /api/v1/auth/password/update", () => {
    it("refuses when there is no recovery session", async () => {
        getUser.mockResolvedValue({ data: { user: null }, error: null });

        const response = await update(request("/api/v1/auth/password/update", {
            password: "a-brand-new-password",
        }));
        const payload = await response.json();

        expect(updateUser).not.toHaveBeenCalled();
        expect(response.status).toBe(401);
        expect(payload.error.message).toMatch(/expired/i);
    });

    it("updates the password through the provider when a session exists", async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: "u1",
                    email: "meera@pagecraft.test",
                    email_confirmed_at: "2026-01-01T00:00:00Z",
                    created_at: "2026-01-01T00:00:00Z",
                },
            },
            error: null,
        });
        updateUser.mockResolvedValue({
            data: {
                user: {
                    id: "u1",
                    email: "meera@pagecraft.test",
                    email_confirmed_at: "2026-01-01T00:00:00Z",
                    created_at: "2026-01-01T00:00:00Z",
                },
            },
            error: null,
        });

        const response = await update(request("/api/v1/auth/password/update", {
            password: "a-brand-new-password",
        }));
        const payload = await response.json();

        expect(updateUser).toHaveBeenCalledWith({ password: "a-brand-new-password" });
        expect(response.status).toBe(200);
        expect(payload.ok).toBe(true);
        expect(payload.data.user.email).toBe("meera@pagecraft.test");
    });
});
