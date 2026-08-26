import { describe, it, expect, vi, beforeEach } from 'vitest';

const signUp = vi.fn();

vi.mock('@/lib/auth/server', () => ({
    supabaseRouteClient: async () => ({ auth: { signUp } }),
}));

import { POST } from '@/app/api/v1/auth/signup/route';

function request(body: unknown) {
    return new Request('http://localhost/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }) as never;
}

const credentials = { email: 'someone@pagecraft.in', password: 'TestPass123!zz' };

async function post(body: unknown = credentials) {
    const response = await POST(request(body));
    return { status: response.status, payload: await response.json() };
}

beforeEach(() => {
    signUp.mockReset();
});

describe('POST /api/v1/auth/signup', () => {
    it('reports a rejected address as a failure, not as a pending signup', async () => {
        signUp.mockResolvedValue({
            data: { user: null, session: null },
            error: { code: 'email_address_invalid', status: 400, message: 'Email address is invalid' },
        });

        const { status, payload } = await post();

        expect(status).toBe(422);
        expect(payload.ok).toBe(false);
        expect(payload.error.code).toBe('validation_failed');
    });

    it('surfaces an unrecognised provider error instead of claiming success', async () => {
        signUp.mockResolvedValue({
            data: { user: null, session: null },
            error: { code: 'unexpected_failure', status: 500, message: 'boom' },
        });

        const { status, payload } = await post();

        expect(status).toBe(500);
        expect(payload.ok).toBe(false);
        expect(payload.error.code).toBe('internal');
    });

    it('tells an already-registered address to sign in, and never mints a pending ticket', async () => {
        signUp.mockResolvedValue({
            data: { user: null, session: null },
            error: { code: 'user_already_exists', status: 422, message: 'User already registered' },
        });

        const { status, payload } = await post();

        expect(status).toBe(409);
        expect(payload.ok).toBe(false);
        expect(payload.error.code).toBe('conflict');
        expect(payload.error.message).toMatch(/already has an account/i);
    });

    it('rejects the masked duplicate (empty identities) instead of auto-signing in later', async () => {
        signUp.mockResolvedValue({
            data: {
                user: { id: 'u-existing', email: credentials.email, identities: [] },
                session: null,
            },
            error: null,
        });

        const { status, payload } = await post();

        expect(status).toBe(409);
        expect(payload.ok).toBe(false);
        expect(payload.error.code).toBe('conflict');
    });

    it('maps a weak password and a rate limit to their own codes', async () => {
        signUp.mockResolvedValue({
            data: { user: null, session: null },
            error: { code: 'weak_password', status: 422, message: 'weak' },
        });
        expect((await post()).payload.error.code).toBe('validation_failed');

        signUp.mockResolvedValue({
            data: { user: null, session: null },
            error: { code: 'over_request_rate_limit', status: 429, message: 'slow down' },
        });
        expect((await post()).payload.error.code).toBe('rate_limited');

        signUp.mockResolvedValue({
            data: { user: null, session: null },
            error: { code: 'over_email_send_rate_limit', status: 400, message: 'email rate' },
        });
        expect((await post()).payload.error.code).toBe('rate_limited');
    });

    it('returns 202 pending when the provider issues a user but no session', async () => {
        signUp.mockResolvedValue({
            data: { user: { id: 'u1', email: credentials.email }, session: null },
            error: null,
        });

        const { status, payload } = await post();

        expect(status).toBe(202);
        expect(payload.data.pending).toBe(true);
        expect(signUp.mock.calls[0][0].options.emailRedirectTo).toMatch(
            /\/api\/v1\/auth\/confirm$/,
        );
    });
});
