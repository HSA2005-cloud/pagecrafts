# Production custom domains (buy + attach)

This is the deploy checklist for selling domains through Go Live
(suggest → pay → register → Cloudflare DNS → live on that hostname).

Free `*.pagecrafts.in` publish does **not** need ResellerClub. Custom-domain
**buy** does.

## Order of work (exact)

### A. Accounts and money (human — once)

1. **ResellerClub reseller account** (India) with prepaid deposit large enough for the TLDs you sell (`.in`, `.co.in`, `.com`).
2. In ResellerClub → **Settings → API**: create an API key; **whitelist every egress IP** that will call the API (Vercel production region IPs / static egress if you have it). Unwhitelisted IPs fail register silently from the app’s point of view.
3. Note your **Reseller Id** (`auth-userid`) and **API key**.
4. Note two **nameservers** ResellerClub accepts for registration (your free DNS NS pair from the control panel). You will set them as `RESELLERCLUB_NS1` / `RESELLERCLUB_NS2`. After pay we **replace** them with Cloudflare’s NS for that zone.
5. **Razorpay** live keys + webhook (same as other checkouts). Webhook must hit your production `/api/v1/...` payment webhook so `kind: domain` fulfills. See `docs/production-payments-setup.md`.
6. Decide refund copy: registry charges are usually **non-refundable** after register — show that before pay (already in confirm dialog; legal/policy page still needed).

### B. Cloudflare (human — once)

Same hosting block as Go Live, **plus Zone create**:

| Variable | Value |
|----------|--------|
| `HOSTING_PROVIDER` | `cloudflare` |
| `HOSTING_API_BASE` | `https://api.cloudflare.com/client/v4` |
| `HOSTING_ACCOUNT_ID` | CF account id |
| `HOSTING_DEPLOY_TOKEN` or sealed `HOSTING_DEPLOY_CREDENTIAL` | API token |
| `PAGECRAFT_ROOT_DOMAIN` / `NEXT_PUBLIC_PAGECRAFT_ROOT_DOMAIN` | `pagecrafts.in` |

Token permissions (minimum):

- Account → **Cloudflare Pages** → Edit
- Account → **Account Settings** → Read (if required by your token template)
- Zone → **Zone** → Edit (create customer zones)
- Zone → **DNS** → Edit
- Zone → **Zone** → Read (for `pagecrafts.in` and new zones)

Confirm: `npm run deploy:health` with Production env loaded.

### C. Database (deploy)

1. Ship migration `supabase/migrations/20260826200000_domains.sql`.
2. On hosted Supabase: `npx supabase db push` (or your usual migrate).
3. Confirm table `public.domains` exists and RLS policies are present.
4. Rollback file (if ever needed): `supabase/rollback/20260826200000_domains.sql`.

### D. Vercel Production env

Set (in addition to existing hosting + Razorpay + Supabase):

```bash
RESELLERCLUB_USER_ID=...
RESELLERCLUB_API_KEY=...
RESELLERCLUB_API_BASE=https://httpapi.com/api
RESELLERCLUB_NS1=ns1.your-reseller-dns.example
RESELLERCLUB_NS2=ns2.your-reseller-dns.example
# optional:
# RESELLERCLUB_CUSTOMER_ID=...   # force one RC customer; else create per buyer email
```

Redeploy after env changes.

### E. Smoke test (production)

1. Publish a draft with **Publish on PageCrafts** (free path) — confirms CF Pages.
2. New draft → Go Live → Choose Custom Domain → accept suggestion → complete Razorpay (small real or test mode carefully).
3. Expect: `domains` row → `registering` → `attaching` → `pending_dns` or `live`.
4. Open `https://{domain}` when status is `live` (NS propagation can take minutes to hours).
5. If stuck on `pending_dns`: check Cloudflare zone NS match ResellerClub WHOIS NS; re-hit verify route / wait for propagation.

### F. What the app does after pay (already coded)

1. Razorpay verify/webhook → `fulfillPaidNotes` / `grantFromOrderNotes` with `kind: "domain"`.
2. `purchaseAndAttachDomain`:
   - register at ResellerClub (customer + contact + `domains/register.json`)
   - `ensureDnsZone` on Cloudflare (create zone, get CF nameservers)
   - `setNameservers` on ResellerClub (`domains/modify-ns.json`)
   - `attachCustomDomain` on Cloudflare Pages
   - set deployment `live_url` when host reports active

### G. Not done yet (do not sell long-term without these)

- **Renewals** job + reminders + failed-card runbook (`docs/phase-2-custom-domains.md` Stage 4)
- **Transfer-out** UI (auth code API is partially wired; no customer-facing button yet)
- Richer WHOIS (billing address capture before buy)
- Markup policy over registry cost

Until G is finished, treat buy as **launch with manual ops** for renewals.

## Local / staging without charging

Omit `RESELLERCLUB_*` → mock registrar (search + fake register).  
Omit Razorpay keys → checkout grants immediately.  
Still need Cloudflare hosting vars to attach a real custom hostname; mock skips NS flip.

## Demo ResellerClub (OT&E)

```bash
RESELLERCLUB_API_BASE=https://test.httpapi.com/api
# NS default to ns1.onlyfordemo.net / ns2.onlyfordemo.net when unset
```

Whitelist the same egress IPs on the **demo** account.
