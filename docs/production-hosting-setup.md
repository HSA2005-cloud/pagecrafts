# Production hosting setup (pagecrafts.in Go Live)

Go Live fails with **Deploy credential is not configured** when the Vercel
**Production** environment is missing the Cloudflare hosting block.

Local `.env.local` does not apply to https://pagecrafts.in.

## Required Vercel Production variables

| Variable | Required | Notes |
|----------|----------|-------|
| `HOSTING_PROVIDER` | Yes | `cloudflare` |
| `HOSTING_API_BASE` | Yes | `https://api.cloudflare.com/client/v4` |
| `HOSTING_ACCOUNT_ID` | Yes | Cloudflare account id (dashboard URL / overview) |
| `HOSTING_CREDENTIAL_KEY_ID` | Yes | Label only, e.g. `cf-deploy-key-2026-08` |
| `PAGECRAFT_ROOT_DOMAIN` | Yes | `pagecrafts.in` |
| `NEXT_PUBLIC_PAGECRAFT_ROOT_DOMAIN` | Yes | `pagecrafts.in` |
| `HOSTING_DEPLOY_TOKEN` **or** `HOSTING_DEPLOY_CREDENTIAL` | Yes | Plain token, or sealed value — see below |
| `SECRET_MASTER_KEY` | If sealing | Base64 32-byte key; required only when using sealed `HOSTING_DEPLOY_CREDENTIAL` |

### Cloudflare API token

Create at https://dash.cloudflare.com/profile/api-tokens with:

- **Account** → Cloudflare Pages → Edit
- **Zone** → Zone → Edit (needed to create zones for customer domains we register)
- **Zone** → DNS → Edit (zone: `pagecrafts.in` and customer zones)
- **Zone** → Zone → Read

Simplest Production setup: set the raw token as `HOSTING_DEPLOY_TOKEN` (never commit it).

Custom domain **buy** (ResellerClub + NS handoff) is documented in
`docs/production-domains-setup.md`.

Or seal it locally and set `HOSTING_DEPLOY_CREDENTIAL`:

```bash
printf '%s' "$CLOUDFLARE_API_TOKEN" > /tmp/cf.token
npm run deploy:seal -- /tmp/cf.token
# paste the printed iv.tag.ciphertext into Vercel as HOSTING_DEPLOY_CREDENTIAL
rm /tmp/cf.token
```

## Verify

```bash
# with Production env loaded (Vercel shell) or a filled .env.local:
npm run deploy:health
npm run check:config
```

Then Go Live on an existing draft site and confirm a `*.pagecrafts.in` URL answers.

## How upload works in production

Publish uses the **Cloudflare Pages Direct Upload API** (hash → upload missing
assets → create deployment). It does **not** run the wrangler CLI on Vercel —
the serverless bundle cannot ship a complete wrangler tree, which used to fail
with `Cannot find module '.../wrangler/wrangler-dist/cli.js'` after auth succeeded.
