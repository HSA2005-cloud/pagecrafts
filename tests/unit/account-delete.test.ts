import { describe, it, expect, vi, beforeEach } from 'vitest';

// DELETE /api/v1/account destroys the account, every site on it, and every paid unlock.
// A session cookie alone must not be enough, so the route re-checks email + password the
// same way sign-in does. These cover the refusals, because the refusals are the point.

const authenticateWithPassword = vi.fn();
const deleteAccount = vi.fn();

const SESSION_EMAIL = 'someone@pagecraft.in';
const GOOD_PASSWORD = 'TestPass123!zz';

const supabase = {};

vi.mock('@/lib/auth/session', () => ({
    requireUser: async () => ({ userId: 'u1', email: SESSION_EMAIL, supabase }),
    supabaseRoute: async () => supabase,
}));

vi.mock('@/lib/auth/password-check', async () => {
    const actual = await vi.importActual<typeof import('@/lib/auth/password-check')>(
        '@/lib/auth/password-check',
    );
    return {
        ...actual,
        authenticateWithPassword: (...args: unknown[]) => authenticateWithPassword(...args),
    };
});

vi.mock('@/lib/data/account', () => ({
    deleteAccount: (...args: unknown[]) => deleteAccount(...args),
    getAccount: async () => ({}),
}));

import { DELETE } from '@/app/api/v1/account/route';

async function del(body: unknown) {
    const request = new Request('http://localhost/api/v1/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const response = await DELETE(request as never, { params: Promise.resolve({}) } as never);
    return { status: response.status, payload: await response.json() };
}

beforeEach(() => {
    authenticateWithPassword.mockReset();
    deleteAccount.mockReset();
    deleteAccount.mockResolvedValue(undefined);
});

describe('DELETE /api/v1/account', () => {
    it('refuses a request with no credentials at all', async () => {
        const { status, payload } = await del({});

        expect(status).toBe(401);
        expect(payload.error.code).toBe('unauthorized');
        expect(deleteAccount).not.toHaveBeenCalled();
    });

    // Otherwise a signed-in person could close somebody else's account by typing their
    // address, as long as they knew that person's password.
    it('refuses an email that is not the one signed in', async () => {
        const { status } = await del({ email: 'someone.else@pagecraft.in', password: GOOD_PASSWORD });

        expect(status).toBe(401);
        expect(authenticateWithPassword).not.toHaveBeenCalled();
        expect(deleteAccount).not.toHaveBeenCalled();
    });

    it('refuses when the password does not check out, and deletes nothing', async () => {
        authenticateWithPassword.mockResolvedValue({
            ok: false,
            status: 401,
            code: 'unauthorized',
            message: 'That email and password do not match.',
        });

        const { status } = await del({ email: SESSION_EMAIL, password: GOOD_PASSWORD });

        expect(status).toBeGreaterThanOrEqual(400);
        expect(deleteAccount).not.toHaveBeenCalled();
    });

    it('deletes the signed-in account once the password checks out', async () => {
        authenticateWithPassword.mockResolvedValue({ ok: true, user: { id: 'u1' } });

        const { status, payload } = await del({ email: SESSION_EMAIL, password: GOOD_PASSWORD });

        expect(status).toBe(200);
        expect(payload.ok).toBe(true);
        expect(deleteAccount).toHaveBeenCalledWith('u1');
    });

    // The id comes from the verified session, never from the body.
    it('deletes the session user even if the body names another id', async () => {
        authenticateWithPassword.mockResolvedValue({ ok: true, user: { id: 'u1' } });

        await del({ email: SESSION_EMAIL, password: GOOD_PASSWORD, userId: 'someone-else' });

        expect(deleteAccount).toHaveBeenCalledWith('u1');
    });
});
