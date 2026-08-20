import { defineConfig, configDefaults } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    test: {
        environment: 'node',
        // A git worktree under .claude/ is a second complete checkout of this
        // repo. Left in scope it doubles the run — every test executes twice,
        // once against a different commit — and the second copy's failures read
        // as failures here. Excluded so a worktree open in the background cannot
        // change what `npm test` reports.
        // e2e/ belongs to Playwright. Vitest's default glob picks up *.spec.ts,
        // so without this `npm test` tries to run the browser tests and dies on
        // the @playwright/test import.
        exclude: [
            ...configDefaults.exclude,
            '**/.claude/worktrees/**',
            '**/.next/**',
            'e2e/**',
        ],
        // The route tests import the route under test from inside the test body, because the
        // module has to be loaded after its mocks are in place. That dynamic import is on the
        // test's clock, and on a full run the transform and import phases together take well
        // over two minutes — so a test whose own work takes 40ms gets judged against a 5s
        // default it spends waiting for esbuild. Two files timed out on one full run and
        // passed in 1.6s in isolation.
        //
        // Raised rather than worked around: nothing here is slow, and a test that hangs for
        // real still fails, thirty seconds later. This is the load-sensitive flake carried in
        // the R3 week-4 plan, which would have surfaced on a slower CI box as an unexplained
        // red build during launch week.
        testTimeout: 30_000,
        hookTimeout: 120_000,
        env: {
            NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
            HOSTING_API_BASE: 'https://api.github.com',
            HOSTING_ACCOUNT_ID: 'pagecraft-sites',
            HOSTING_CREDENTIAL_KEY_ID: 'test-key',
            PAGECRAFT_ROOT_DOMAIN: 'pagecrafts.in',
            UPSTASH_REDIS_REST_URL: '',
            UPSTASH_REDIS_REST_TOKEN: '',
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
        },
    },
});