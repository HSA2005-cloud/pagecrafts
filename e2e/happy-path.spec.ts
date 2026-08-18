import { test, expect } from '@playwright/test';
import { signIn } from './support/sign-in';
import { newAccount, signUp } from './support/sign-up';
import { STATE } from './support/users';

// Signing in goes through the login rate limiter, which fails closed when it
// cannot reach Upstash (NFR-034). With no Redis these tests would fail with a
// throttle rather than an auth problem, which reads as a broken login and is
// not. Set E2E_WITH_AUTH=1 wherever real Upstash credentials are present.
const withAuth = process.env.E2E_WITH_AUTH === '1';

test.describe('the happy path', () => {
    test.skip(!withAuth, 'needs Upstash: set E2E_WITH_AUTH=1');

    test.use({ storageState: STATE.first });

    test('a seeded user signs in and lands on the describe screen', async ({ browser }) => {
        const context = await browser.newContext({ storageState: undefined });
        const page = await context.newPage();
        await signIn(page);

        await expect(page).toHaveURL(/\/new/);
        await context.close();
    });

    test('a signed-in user is known to the API', async ({ page }) => {
        const response = await page.request.get('/api/v1/auth/me');
        const body = await response.json();

        expect(response.status()).toBe(200);
        expect(body.ok).toBe(true);
        expect(body.data.user.email).toBeTruthy();
    });

    test('the gallery lists designs and one can be opened', async ({ page }) => {
        await page.goto('/templates');

        const response = await page.request.get('/api/v1/templates');
        const body = await response.json();

        expect(body.ok).toBe(true);
        expect(body.data.items.length).toBeGreaterThan(0);

        const first = body.data.items[0];
        const detail = await page.request.get(`/api/v1/templates/${first.id}`);

        expect(detail.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    // Logging out revokes the Supabase session server-side, so a second context loaded from
    // STATE.first is not independent: it carries the same refresh token as every later test.
    // Use a disposable account to test logout without invalidating the suite's seeded session.
    test('signing out ends the session', async ({ browser }) => {
        const context = await browser.newContext({ storageState: undefined });
        const page = await context.newPage();
        const outcome = await signUp(page, newAccount());
        if (outcome === 'needs-email') {
            await context.close();
            test.skip(true, 'this run confirms by email; no inbox here');
        }

        const out = await page.request.post('/api/v1/auth/logout');
        expect(out.status()).toBe(200);

        const me = await page.request.get('/api/v1/auth/me');
        expect(me.status()).toBe(401);

        await context.close();
    });
});

test.describe('the doors are locked', () => {
    test.skip(!withAuth, 'needs Upstash: set E2E_WITH_AUTH=1');

    test.use({ storageState: STATE.first });

    test('a project belonging to nobody is not found, not a crash', async ({ page }) => {
        const response = await page.request.get(
            '/api/v1/projects/00000000-0000-0000-0000-000000000000',
        );
        const body = await response.json();

        expect(response.status()).toBe(404);
        expect(body).toMatchObject({ ok: false, error: { code: 'not_found' } });
    });

    test('the editor cannot be reached signed out', async ({ page }) => {
        await page.context().clearCookies();

        const response = await page.request.get('/api/v1/projects', {
            failOnStatusCode: false,
        });

        expect(response.status()).toBe(401);
    });
});
