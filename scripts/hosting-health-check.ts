// Proves the deploy credential reaches the hosting provider that is actually configured.
//
// This used to call GitHub unconditionally, which stopped being true on D5 when
// HOSTING_PROVIDER moved to Cloudflare. It would have passed or failed for reasons
// unrelated to the provider doing the publishing — the worst kind of health check.
import { cf, accountPath } from '@/lib/deploy/adapters/cloudflare-client';
import { gh } from '@/lib/deploy/adapters/github-client';
import { deployConfig } from '@/lib/deploy/config';

const provider = process.env.HOSTING_PROVIDER ?? 'cloudflare';

async function cloudflare() {
    // Listing Pages projects rather than reading the account, deliberately: it is the
    // narrowest call the deploy token must be able to make. The token is scoped to
    // Pages:Edit, DNS:Edit and Zone:Read — it cannot read account settings, so checking
    // /accounts/{id} would fail on a correctly-scoped token and pass on an over-scoped
    // one. This asks exactly the question that matters: can we deploy?
    const projects = await cf<{ name: string }[]>('GET', accountPath('/pages/projects'));
    console.log('pages sites :', projects.length);
}

async function github() {
    const { data } = await gh<{ login: string; id: number }>(
        'GET',
        `/orgs/${deployConfig().accountId}`,
    );
    console.log('github org  :', data.login, `(id ${data.id})`);
}

async function main() {
    const config = deployConfig();

    console.log('provider    :', provider);
    console.log('api base    :', config.apiBase);
    console.log('root domain :', config.rootDomain);
    console.log('key id      :', config.credentialKeyId);

    if (provider === 'github') await github();
    else await cloudflare();

    console.log('\nhealth check passed');
}

main().catch((err) => {
    console.error('health check failed:', err.message);
    if (err.cause) console.error('cause:', err.cause);
    process.exit(1);
});
