# Domain Connect (GoDaddy-first)

One-click DNS for shop owners who **already own** a domain. They tap Authorize at
their registrar — no CNAME typing.

## Best provider for PageCrafts

**GoDaddy first.** Largest share for Indian small businesses buying `.com` / `.in`,
invented Domain Connect, mature Authorize UX. Then Cloudflare, then IONOS / NameSilo.

Code priority: `DOMAIN_CONNECT_PRIORITY` in `src/lib/domains/domain-connect/types.ts`.

## What you must do once (ops)

Domain Connect does **not** work until GoDaddy (and later others) **onboard our template**.

1. Publish the template JSON (already in repo):
   `docs/domain-connect/pagecrafts.in.website.json`
2. Open a PR to https://github.com/Domain-Connect/Templates (filename
   `pagecrafts.in.website.json`).
3. Email **domainconnect@godaddy.com** with:
   - Link to the merged template
   - PageCrafts logo (SVG)
   - Production callback origin (`https://pagecrafts.in`)
   - Ask to enable providerId `pagecrafts.in` / serviceId `website`
4. Optional next: `domain-connect@cloudflare.com` (requires RSA signing — set
   `DOMAIN_CONNECT_PRIVATE_KEY` + publish public key TXT on
   `domainconnect.pagecrafts.in`).
5. Set env:
   ```bash
   NEXT_PUBLIC_APP_URL=https://pagecrafts.in
   # optional hardening:
   DOMAIN_CONNECT_STATE_SECRET=long-random
   # required for Cloudflare Domain Connect signing:
   # DOMAIN_CONNECT_PRIVATE_KEY=<PEM contents from your keypair>
   # DOMAIN_CONNECT_KEY_ID=1
   ```

Until GoDaddy enables the template, Authorize may fail — the app still attaches the
hostname on Cloudflare and can fall back to showing DNS records.

## User flow (already in Go Live)

1. Go Live → warn → address  
2. **I already have a domain** → enter `yourshop.in`  
3. We publish to `*.pagecrafts.in`, attach custom hostname on Pages  
4. If Domain Connect is found → redirect to GoDaddy Authorize  
5. User taps Authorize → callback → verify → editor  

## APIs

- `POST /api/v1/projects/{id}/domains/domain-connect` `{ name }`  
  → `{ applyUrl, providerName, pagesTarget, domain, message? }`
- `GET /api/v1/domains/domain-connect/callback?state=...`  
  → redirect to editor

## Local test without GoDaddy onboard

Omit real Domain Connect: discovery returns unsupported → UI still publishes and
shows the fallback message. Mock registrar / buy path is separate.
