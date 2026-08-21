import { describe, it, expect, vi, beforeEach } from "vitest";

const resend = vi.fn();

vi.mock("@/lib/auth/server", () => ({
    supabaseRouteClient: async () => ({ auth: { resend } }),
}));

vi.mock("@/lib/config/env", () => ({
    publicEnv: { appUrl: "http://localhost:3000", supabaseUrl: "", supabaseAnonKey: "" },
}));

import { POST } from "@/app/api/v1/auth/verify/resend/route";

function request(body: unknown) {
    return new Request("http://localhost/api/v1/auth/verify/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    }) as never;
}

async function post(body: unknown) {
    const response = await POST(request(body));
    return { status: response.status, payload: await response.json() };
}

beforeEach(() => {
    resend.mockReset();
});

describe("POST /api/v1/auth/verify/resend", () => {
    it("asks the provider to send a confirmation mail", async () => {
        resend.mockResolvedValue({ data: {}, error: null });

        const { status, payload } = await post({ email: "meera@pagecraft.test" });

        expect(resend).toHaveBeenCalledWith({
            type: "signup",
            email: "meera@pagecraft.test",
            options: { emailRedirectTo: "http://localhost:3000/api/v1/auth/confirm?next=/new" },
        });
        expect(status).toBe(202);
        expect(payload).toEqual({ ok: true, data: { status: "accepted" } });
    });

    it("tells an already-registered address to sign in instead of pretending mail was sent", async () => {
        resend.mockResolvedValue({
            data: {},
            error: { code: "email_exists", status: 422, message: "A user with this email address has already been registered" },
        });

        const { status, payload } = await post({ email: "preethisv36@gmail.com" });

        expect(status).toBe(200);
        expect(payload).toEqual({ ok: true, data: { status: "signin" } });
    });

    it("surfaces a send rate limit", async () => {
        resend.mockResolvedValue({
            data: {},
            error: { code: "over_email_send_rate_limit", status: 429, message: "too many" },
        });

        const { status, payload } = await post({ email: "meera@pagecraft.test" });

        expect(status).toBe(429);
        expect(payload.error.code).toBe("rate_limited");
    });

    it("does not claim success when the provider fails to send", async () => {
        resend.mockResolvedValue({
            data: {},
            error: { code: "unexpected_failure", status: 500, message: "smtp down" },
        });

        const { status, payload } = await post({ email: "meera@pagecraft.test" });

        expect(status).toBe(500);
        expect(payload.ok).toBe(false);
        expect(payload.error.code).toBe("internal");
    });
});
