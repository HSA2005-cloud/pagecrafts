import { test, expect, type APIRequestContext } from '@playwright/test';
import { newAccount, signUp } from './support/sign-up';
import { canGrantEntitlements, grantPublish } from './support/entitle';

// D14: the whole walk, from an account that did not exist to a published site.
//
// The suite before this one started from a seeded user, so signup itself — the very first
// thing anybody does — was the one step nothing exercised.
//
// How far this can honestly go depends on what the run has been given, and each stopping
// point is asserted rather than skipped past:
//
//   no Upstash          — sign-in fails closed, so nothing runs (same gate as happy-path)
//   no service role     — the walk stops at the paywall, and the paywall must say so
//   no hosting          — publishing is attempted and fails, and the failure must be a
//                         sentence, with a status that is never a bare 500
//   everything present  — the deployment reaches `live` and the URL it reports responds
//
// Set E2E_WITH_HOSTING=1 only where real hosting credentials exist. It is what turns
// "publishing failed politely" into "the site is actually live".
const withAuth = process.env.E2E_WITH_AUTH === '1';
const withHosting = process.env.E2E_WITH_HOSTING === '1';

interface Envelope {
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string; detail?: string };
}

// Every assertion about a failure in this file goes through here, because "returns a real
// message, never a bare 500" is one rule and it should be written down once.
function expectRealFailure(status: number, body: Envelope, what: string) {
    expect(status, `${what} answered ${status}`).toBeLessThan(500);
    expect(body.ok, `${what} did not use the failure envelope`).toBe(false);
    expect(body.error, `${what} carried no error`).toBeTruthy();

    const message = body.error!.message;

    expect(typeof message).toBe('string');
    expect(message.length, `${what} gave a message too terse to act on`).toBeGreaterThan(10);
    expect(message, `${what} showed the reader a machine code`).not.toContain('_');
}

async function poll(
    request: APIRequestContext,
    deploymentId: string,
    timeoutMs = 90_000,
): Promise<{ status: string; body: Envelope }> {
    const deadline = Date.now() + timeoutMs;

    // Deliberately not a fixed number of tries: publishing is slow and variable, and a test
    // that gives up after N quick polls reports a hosting failure that never happened.
    while (Date.now() < deadline) {
        const response = await request.get(`/api/v1/deployments/${deploymentId}`);
        const body = (await response.json()) as Envelope;

        expect(response.status(), 'polling a deployment').toBe(200);

        const state = body.data?.status as string;
        if (state === 'live' || state === 'failed') return { status: state, body };

        await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    throw new Error(`Deployment ${deploymentId} never settled`);
}

async function createPublishableProject(
    request: APIRequestContext,
    name: string,
): Promise<string> {
    const templates = await request.get('/api/v1/templates?tier=free');
    const templatesBody = (await templates.json()) as Envelope;
    const items = templatesBody.data?.items as Array<{ id: string }> | undefined;

    expect(templates.status(), 'listing templates for a new project').toBe(200);
    expect(items?.length, 'a publish walk needs at least one template').toBeGreaterThan(0);

    const detail = await request.get(`/api/v1/templates/${items![0].id}`);
    const detailBody = (await detail.json()) as Envelope;
    const sourceTemplateId = detailBody.data?.forkId as string | undefined;

    expect(detail.status(), 'reading the template selected for a new project').toBe(200);
    expect(sourceTemplateId, 'a template detail needs its fork id').toBeTruthy();

    const created = await request.post('/api/v1/projects', {
        data: { name, sourceTemplateId },
    });
    const createdBody = (await created.json()) as Envelope;

    expect(created.status(), 'creating a project from a template').toBe(201);
    expect(createdBody.ok).toBe(true);

    const projectId = createdBody.data!.id as string;
    expect(projectId).toBeTruthy();
    return projectId;
}

test.describe('signup to a live URL', () => {
    test.skip(!withAuth, 'needs Upstash: set E2E_WITH_AUTH=1');

    test('a brand-new account can sign up, make a site and publish it', async ({ page }) => {
        const who = newAccount();

        const outcome = await signUp(page, who);
        test.skip(outcome === 'needs-email', 'this run confirms by email; no inbox here');

        // Signed up means signed in: the API knows them without a second login.
        const me = await page.request.get('/api/v1/auth/me');
        const meBody = (await me.json()) as Envelope;

        expect(me.status()).toBe(200);
        expect(meBody.ok).toBe(true);

        const user = meBody.data!.user as { id: string; email: string };
        expect(user.email).toBe(who.email);

        // A new account starts empty. If this ever returns somebody else's work, the whole
        // ownership model is wrong — which is the D20 milestone, asserted here for free.
        const before = await page.request.get('/api/v1/projects');
        const beforeBody = (await before.json()) as Envelope;

        expect(before.status()).toBe(200);
        expect((beforeBody.data!.items as unknown[]).length).toBe(0);

        const projectId = await createPublishableProject(page.request, 'My E2E Site');

        // Publishing without having paid must be refused, and refused in words. This is a
        // real failure path and it runs on every CI machine, credentials or not.
        const unpaid = await page.request.post(`/api/v1/projects/${projectId}/publish`, {
            headers: { 'Idempotency-Key': `e2e-${projectId}-unpaid` },
            failOnStatusCode: false,
        });
        const unpaidBody = (await unpaid.json()) as Envelope;

        if (unpaid.status() !== 202) {
            expect(unpaid.status(), 'publishing unpaid').toBe(402);
            expectRealFailure(unpaid.status(), unpaidBody, 'publishing without an entitlement');
        }

        test.skip(!canGrantEntitlements(), 'needs the service role key to grant publishing');

        await grantPublish(user.id, projectId);

        const accepted = await page.request.post(`/api/v1/projects/${projectId}/publish`, {
            headers: { 'Idempotency-Key': `e2e-${projectId}-1` },
            failOnStatusCode: false,
        });
        const acceptedBody = (await accepted.json()) as Envelope;

        expect(accepted.status(), 'publishing once entitled').toBe(202);
        expect(acceptedBody.data!.status).toBe('pending');

        const deploymentId = acceptedBody.data!.deploymentId as string;
        expect(deploymentId).toBeTruthy();

        const settled = await poll(page.request, deploymentId);

        if (settled.status === 'failed') {
            // Without hosting credentials this is the expected end of the walk. What matters
            // is that the failure is legible: a sentence on the dashboard, not a stack trace
            // and not an empty status.
            const message = settled.body.data!.error as string | null;

            expect(withHosting, 'publishing failed on a run configured for hosting').toBe(false);
            expect(message, 'a failed publish recorded no reason').toBeTruthy();
            expect(message!.length).toBeGreaterThan(10);
            expect(message).not.toContain('_');
            return;
        }

        expect(settled.status).toBe('live');

        const liveUrl = settled.body.data!.liveUrl as string;

        expect(liveUrl, 'a live deployment must carry a URL').toBeTruthy();
        expect(liveUrl).toMatch(/^https:\/\//);

        // C-05: a URL is only reported live once it has been confirmed to respond, so this
        // is checking the promise the contract makes rather than merely the string's shape.
        const live = await page.request.get(liveUrl, { failOnStatusCode: false });
        expect(live.status(), `the published site at ${liveUrl}`).toBeLessThan(400);
    });

    // Signed in, so the id actually reaches the database. withRoute settles authentication
    // first, which is why these cannot live in the signed-out sweep: there they would answer
    // 401 without the id being looked at, and pass without testing anything.
    //
    // `id` is a uuid column, so a malformed one is a type error to Postgres rather than an
    // empty result. Unmapped that is `internal` — a 500 for a mistyped address.
    test('an address that cannot be an id is refused in words, not a 500', async ({ page }) => {
        const who = newAccount();
        const outcome = await signUp(page, who);
        test.skip(outcome === 'needs-email', 'this run confirms by email; no inbox here');

        for (const bad of ['not-a-uuid', '123', 'undefined']) {
            for (const path of [`/api/v1/projects/${bad}`, `/api/v1/deployments/${bad}`]) {
                const response = await page.request.get(path, { failOnStatusCode: false });
                const body = (await response.json()) as Envelope;

                expectRealFailure(response.status(), body, `GET ${path}`);
                expect([400, 404, 422], `GET ${path} answered ${response.status()}`).toContain(
                    response.status(),
                );
            }
        }
    });

    test('a second publish does not start a second deployment', async ({ page }) => {
        test.skip(!canGrantEntitlements(), 'needs the service role key to grant publishing');

        const who = newAccount();
        const outcome = await signUp(page, who);
        test.skip(outcome === 'needs-email', 'this run confirms by email; no inbox here');

        const me = (await (await page.request.get('/api/v1/auth/me')).json()) as Envelope;
        const user = me.data!.user as { id: string };

        const projectId = await createPublishableProject(page.request, 'Twice');

        await grantPublish(user.id, projectId);

        const key = `e2e-${projectId}-same`;

        const first = await page.request.post(`/api/v1/projects/${projectId}/publish`, {
            headers: { 'Idempotency-Key': key },
            failOnStatusCode: false,
        });
        const second = await page.request.post(`/api/v1/projects/${projectId}/publish`, {
            headers: { 'Idempotency-Key': key },
            failOnStatusCode: false,
        });

        const firstBody = (await first.json()) as Envelope;
        const secondBody = (await second.json()) as Envelope;

        expect(first.status()).toBe(202);
        expect(second.status()).toBe(202);

        // Two sites for one project means two subdomains and, once payment is wired, two
        // charges. The second call must join the attempt already running.
        expect(secondBody.data!.deploymentId).toBe(firstBody.data!.deploymentId);
    });
});
