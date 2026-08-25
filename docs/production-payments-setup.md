# Production payments setup (pagecrafts.in)

PageCrafts runs on **Vercel** at **https://pagecrafts.in**. Choose Pro / Choose Premium
needs Razorpay keys in the **Production** environment — localhost `.env.local` does not
apply to the live site.

## Symptom on production

- `/plans` shows **Choose Pro** / **Choose Premium**
- Clicking either shows: *"Checkout is not set up on this server yet…"*
- Server-rendered page data includes `"paymentsReady": false`

That means `RAZORPAY_KEY_ID` and/or `RAZORPAY_KEY_SECRET` are **missing** in Vercel
Production (see `paymentsConfigured()` in `src/lib/payments/razorpay.ts`).

## Required Vercel Production variables

Set these in **Vercel → Project → Settings → Environment Variables → Production**:

| Variable | Required | Notes |
|----------|----------|-------|
| `RAZORPAY_KEY_ID` | **Yes** | Test: `rzp_test_…` · Live: `rzp_live_…` |
| `RAZORPAY_KEY_SECRET` | **Yes** | Server-only. Never commit. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Optional | Defaults to `RAZORPAY_KEY_ID` if omitted |
| `RAZORPAY_WEBHOOK_SECRET` | Recommended | Backup grant path after payment |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Must be `https://pagecrafts.in` |

Also confirm these are already set (auth / DB):

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `UPSTASH_REDIS_REST_URL` | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Yes |

Run locally against your env file:

```bash
npm run check:config
```

In a Vercel shell (Production):

```bash
npm run check:config
```

## Razorpay dashboard (Test Mode while validating)

1. Create **Test Mode** API keys in [Razorpay Dashboard → Settings → API Keys](https://dashboard.razorpay.com/app/keys).
2. Add the Key ID + Secret to Vercel Production (above).
3. **Redeploy** production (env changes need a new deployment).

### Webhook (recommended)

URL:

```text
https://pagecrafts.in/api/v1/payments/razorpay/webhook
```

Event: `payment.captured`

Set the webhook secret you choose as `RAZORPAY_WEBHOOK_SECRET` in Vercel.

The browser verify route (`/api/v1/payments/razorpay/verify`) also grants after
signature check; the webhook is a second idempotent path.

## Verify production after deploy

```bash
# API routes exist (401 without session is expected)
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://pagecrafts.in/api/v1/account/billing/checkout \
  -H 'content-type: application/json' -d '{"plan":"pro"}'

# paymentsReady should become true in page HTML after keys are set
curl -s https://pagecrafts.in/plans | grep -o '"paymentsReady":[^,]*'
```

Expected after fix: `"paymentsReady":true`

Then sign in on https://pagecrafts.in/plans → Choose Pro → Razorpay Test Checkout opens.

## Failure chain (missing Razorpay keys)

```text
Choose Pro
  → Agree (Razorpay confirm dialog)
  → POST /api/v1/account/billing/checkout  {"plan":"pro"}
  → 503 payments_unavailable
  → createOrder() → credentials() — RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing
  → UI: "Checkout is not set up on this server yet…"
```

A scratch-card code that cannot be held answers `invalid_discount` (422), not a generic 500.
If PostgREST has not reloaded after the discount migration, checkout still holds the card
with a table update so paying is not blocked on the RPC schema cache.

## Security

- `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are **server-only**.
- Do not prefix secrets with `NEXT_PUBLIC_`.
- Prices are decided server-side (Pro ₹499, Premium ₹999); the browser only sends `plan`.

## Scratch-card discount codes

Do **not** create Razorpay Offers/coupons for these cards. PageCrafts stores unique
codes and creates the Razorpay order at the discounted amount (a 100% card skips
Razorpay and grants immediately).

1. Keep the existing live keys (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`) in Vercel.
2. Apply the `discount_codes` migration to production (`npx supabase db push` or your usual migrate).
3. Mint a batch (service role, against production env):

```bash
npm run pay:mint-codes -- --count 50 --percent 20 --applies all --batch "fair-2026"
```

Print the `code` column on the physical cards. Buyers type it on `/plans` (or AI packages)
before they pay. Each code is one-time by default.
