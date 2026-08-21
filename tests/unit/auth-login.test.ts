import { describe, it, expect, vi, beforeEach } from "vitest";

const { signInWithPassword, consume } = vi.hoisted(() => ({
    signInWithPassword: vi.fn(),
    consume: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
    supabaseRouteClient: async () => ({ auth: { signInWithPassword } }),
}));

vi.mock("@/lib/limits/rate-limit", () => ({ consume }));

vi.mock("@/lib/limits/client-ip", () => ({
    clientIp: () => "203.0.113.9",
    UNKNOWN_IP: "unknown",
}));

import { POST } from "@/app/api/v1/auth/login/route";

function request(body: unknown) {
    return new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify(body),
    }) as never;
}

const credentials = { email: "meera@pagecraft.test", password: "pagecraft-dev-123" };

async function post(body: unknown = credentials) {
    const response = await POST(request(body));
    return { status: response.status, payload: await response.json() };
}

beforeEach(() => {
    signInWithPassword.mockReset();
    consume.mockReset();
    consume.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 0, degraded: false });
});

describe("POST /api/v1/auth/login", () => {
    it("signs in against the auth provider and returns the session user", async () => {
        signInWithPassword.mockResolvedValue({
            data: {
                user: {
                    id: "u1",
                    email: credentials.email,
                    email_confirmed_at: "2026-01-01T00:00:00Z",
                    created_at: "2026-01-01T00:00:00Z",
                },
                session: { access_token: "tok" },
            },
            error: null,
        });

        const { status, payload } = await post();

        expect(signInWithPassword).toHaveBeenCalledWith({
            email: credentials.email,
            password: credentials.password,
        });
        expect(status).toBe(200);
        expect(payload).toEqual({
            ok: true,
            data: {
                user: {
                    id: "u1",
                    email: credentials.email,
                    emailVerified: true,
                    createdAt: "2026-01-01T00:00:00Z",
                },
            },
        });
    });

    it("does not tell a caller whether the email or the password was wrong", async () => {
        signInWithPassword.mockResolvedValue({
            data: { user: null, session: null },
            error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
        });

        const { status, payload } = await post({
            email: "nobody@pagecraft.test",
            password: "definitely-wrong-123",
        });

        expect(status).toBe(401);
        expect(payload.error.code).toBe("unauthorized");
        expect(payload.error.message).not.toMatch(/nobody|not found|no account/i);
    });

    it("asks them to confirm email instead of pretending the password is wrong", async () => {
        signInWithPassword.mockResolvedValue({
            data: { user: null, session: null },
            error: { code: "email_not_confirmed", status: 400, message: "Email not confirmed" },
        });

        const { payload } = await post();

        expect(payload.error.code).toBe("forbidden");
        expect(payload.error.message).toMatch(/confirm your email/i);
    });

    it("maps a provider rate limit", async () => {
        signInWithPassword.mockResolvedValue({
            data: { user: null, session: null },
            error: { code: "over_request_rate_limit", status: 429, message: "slow" },
        });

        const { status, payload } = await post();

        expect(status).toBe(429);
        expect(payload.error.code).toBe("rate_limited");
    });

    it("refuses before talking to the provider when our limiter is exhausted", async () => {
        consume.mockResolvedValueOnce({ allowed: true, remaining: 9, retryAfterSeconds: 0, degraded: false });
        consume.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60, degraded: false });

        const { status, payload } = await post();

        expect(signInWithPassword).not.toHaveBeenCalled();
        expect(status).toBe(429);
        expect(payload.error.code).toBe("rate_limited");
    });

    it("treats a short password as a failed sign-in, not a validation leak", async () => {
        const { status, payload } = await post({ email: "me@example.com", password: "x" });

        expect(signInWithPassword).not.toHaveBeenCalled();
        expect(status).toBe(401);
        expect(payload.error.code).toBe("unauthorized");
    });
});
