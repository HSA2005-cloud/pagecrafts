import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    consume: vi.fn(),
    signInWithPassword: vi.fn(),
}));

vi.mock("@/lib/limits/rate-limit", () => ({
    consume: mocks.consume,
}));

import {
    authenticateWithPassword,
    PASSWORD_GENERIC_FAILURE,
    PASSWORD_THROTTLED,
} from "@/lib/auth/password-check";

const { consume, signInWithPassword } = mocks;

const allowed = { allowed: true, remaining: 4, retryAfterSeconds: 0, degraded: false };
const denied = { allowed: false, remaining: 0, retryAfterSeconds: 90, degraded: false };

function headers(ip?: string) {
    const next = new Headers();
    if (ip) next.set("x-forwarded-for", ip);
    return next;
}

function supabase() {
    return { auth: { signInWithPassword } } as never;
}

beforeEach(() => {
    consume.mockReset();
    signInWithPassword.mockReset();
    consume.mockResolvedValue(allowed);
});

describe("authenticateWithPassword", () => {
    it("signs in with the submitted email and password", async () => {
        signInWithPassword.mockResolvedValue({
            data: { user: { id: "u1", email: "kedar@example.com" } },
            error: null,
        });

        const result = await authenticateWithPassword({
            headers: headers("1.2.3.4"),
            supabase: supabase(),
            email: "Kedar@example.com",
            password: "correct-horse",
        });

        expect(result).toEqual({ ok: true, user: { id: "u1", email: "kedar@example.com" } });
        expect(signInWithPassword).toHaveBeenCalledWith({
            email: "kedar@example.com",
            password: "correct-horse",
        });
        expect(consume).toHaveBeenCalledWith("login:ip", "1.2.3.4", expect.any(Object));
        expect(consume).toHaveBeenCalledWith("login:email", "kedar@example.com", expect.any(Object));
    });

    it("answers with the same generic failure as sign-in when the password is wrong", async () => {
        signInWithPassword.mockResolvedValue({
            data: { user: null },
            error: { status: 400, code: "invalid_credentials", message: "Invalid login" },
        });

        const result = await authenticateWithPassword({
            headers: headers("1.2.3.4"),
            supabase: supabase(),
            email: "kedar@example.com",
            password: "wrong-password",
        });

        expect(result).toEqual({
            ok: false,
            code: "unauthorized",
            message: PASSWORD_GENERIC_FAILURE,
        });
    });

    it("uses the same throttle as sign-in", async () => {
        consume.mockResolvedValueOnce(denied);

        const result = await authenticateWithPassword({
            headers: headers("1.2.3.4"),
            supabase: supabase(),
            email: "kedar@example.com",
            password: "correct-horse",
        });

        expect(result).toMatchObject({
            ok: false,
            code: "rate_limited",
            message: PASSWORD_THROTTLED,
            retryAfterSeconds: 90,
        });
        expect(signInWithPassword).not.toHaveBeenCalled();
    });
});
