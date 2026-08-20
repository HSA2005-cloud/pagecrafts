import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "../support/fake-db";

const auth = vi.hoisted(() => ({ requireUser: vi.fn(), supabaseRoute: vi.fn() }));
const password = vi.hoisted(() => ({ authenticateWithPassword: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
    requireUser: auth.requireUser,
    supabaseRoute: auth.supabaseRoute,
}));

vi.mock("@/lib/auth/password-check", () => ({
    authenticateWithPassword: password.authenticateWithPassword,
    passwordAttemptResponse: (result: { code: string; message: string }) =>
        Response.json(
            { ok: false, error: { code: result.code, message: result.message } },
            { status: result.code === "rate_limited" ? 429 : result.code === "forbidden" ? 403 : 401 },
        ),
    PASSWORD_GENERIC_FAILURE: "That email and password combination is not correct.",
    PASSWORD_THROTTLED: "Too many sign-in attempts. Try again in a few minutes.",
}));

const OWNER = "11111111-1111-4111-8111-000000000001";
const OWNER_EMAIL = "owner@pagecraft.test";
const OWNER_PASSWORD = "correct-horse";
const GENERIC = "That email and password combination is not correct.";

let db: FakeDb;

function signedIn() {
    const supabase = db.asUser(OWNER);
    auth.requireUser.mockResolvedValue({ userId: OWNER, supabase, email: OWNER_EMAIL });
    auth.supabaseRoute.mockResolvedValue(supabase);
}

const url = (path: string, init?: RequestInit) =>
    new Request(`http://localhost${path}`, init) as never;

const jsonBody = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
});

const params = (value: Record<string, unknown>) => ({ params: Promise.resolve(value) }) as never;

async function read(response: Response) {
    return { status: response.status, json: await response.json() };
}

beforeEach(() => {
    vi.clearAllMocks();
    password.authenticateWithPassword.mockResolvedValue({ ok: true, user: { id: OWNER } });
    db = createFakeDb({
        users: [{ id: OWNER }],
        projects: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: OWNER, name: "Kettle" }],
    });
    signedIn();
});

describe("DELETE /projects/{id} password gate", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    it("refuses a request with no password and leaves the project", async () => {
        const { DELETE } = await import("@/app/api/v1/projects/[id]/route");
        const result = await read(await DELETE(url(`/api/v1/projects/${id}`), params({ id })));

        expect(result.status).toBe(401);
        expect(result.json).toMatchObject({
            ok: false,
            error: { code: "unauthorized", message: GENERIC },
        });
        expect(password.authenticateWithPassword).not.toHaveBeenCalled();
        expect(db.rows("projects")).toHaveLength(1);
    });

    it("refuses a password that is not this account's, without deleting", async () => {
        password.authenticateWithPassword.mockResolvedValue({
            ok: false,
            code: "unauthorized",
            message: GENERIC,
        });
        const { DELETE } = await import("@/app/api/v1/projects/[id]/route");
        const result = await read(
            await DELETE(
                url(
                    `/api/v1/projects/${id}`,
                    jsonBody("DELETE", { email: OWNER_EMAIL, password: OWNER_PASSWORD }),
                ),
                params({ id }),
            ),
        );

        expect(result.status).toBe(401);
        expect(result.json.error.message).toBe(GENERIC);
        expect(db.rows("projects")).toHaveLength(1);
    });

    it("does not check a password when the email is not this session's", async () => {
        const { DELETE } = await import("@/app/api/v1/projects/[id]/route");
        const result = await read(
            await DELETE(
                url(
                    `/api/v1/projects/${id}`,
                    jsonBody("DELETE", { email: "other@pagecraft.test", password: OWNER_PASSWORD }),
                ),
                params({ id }),
            ),
        );

        expect(result.status).toBe(401);
        expect(result.json.error.message).toBe(GENERIC);
        expect(password.authenticateWithPassword).not.toHaveBeenCalled();
        expect(db.rows("projects")).toHaveLength(1);
    });

    it("deletes after the same password check as sign-in", async () => {
        const { DELETE } = await import("@/app/api/v1/projects/[id]/route");
        const result = await read(
            await DELETE(
                url(
                    `/api/v1/projects/${id}`,
                    jsonBody("DELETE", { email: OWNER_EMAIL, password: OWNER_PASSWORD }),
                ),
                params({ id }),
            ),
        );

        expect(result.status).toBe(200);
        expect(result.json.data).toEqual({ deleted: true });
        expect(password.authenticateWithPassword).toHaveBeenCalledWith(
            expect.objectContaining({
                email: OWNER_EMAIL,
                password: OWNER_PASSWORD,
            }),
        );
        expect(db.rows("projects")).toHaveLength(0);
    });
});
