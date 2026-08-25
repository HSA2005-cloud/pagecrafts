#!/usr/bin/env bash
# Per-boot reconciliation: bring Docker + the local Supabase stack + the Redis/SRH
# rate-limiter backend online, then write .env.local so the Next.js app can boot.
# Returns once the stack is ready; the dev server runs in the `next-dev` terminal.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/.."

# Every boot: pull + gh default to AdithyaPatil-1609/pagecrafts (original).
bash "$here/../scripts/setup-original-repo.sh" || true

bash "$here/docker-up.sh"

# The app doesn't use realtime, edge functions, or analytics; those services are
# also the flaky ones in a nested VM, so skip them for a fast, reliable start.
supabase start -x realtime,edge-runtime,logflare,vector

# Make the schema + seed match this branch's migrations (mirrors the CI database
# job). Loads supabase/seed.sql, including the dev sign-in accounts.
supabase db reset --local

# Derive the local stack's URL + keys and write the app env. These are Supabase's
# well-known local development keys, not secrets.
status="$(supabase status -o env 2>/dev/null || true)"
read_status() { printf '%s\n' "$status" | grep "^$1=" | cut -d= -f2- | tr -d '"'; }

# Keep Razorpay test keys across boots: prefer process env, else a previous .env.local.
# Never invent live keys here — checkout stays off until a real rzp_test_* pair is set.
read_prev_env() {
  local key="$1"
  if [[ -f .env.local ]]; then
    grep "^${key}=" .env.local 2>/dev/null | cut -d= -f2- || true
  fi
}
RAZORPAY_KEY_ID_VALUE="${RAZORPAY_KEY_ID:-$(read_prev_env RAZORPAY_KEY_ID)}"
RAZORPAY_KEY_SECRET_VALUE="${RAZORPAY_KEY_SECRET:-$(read_prev_env RAZORPAY_KEY_SECRET)}"
RAZORPAY_WEBHOOK_SECRET_VALUE="${RAZORPAY_WEBHOOK_SECRET:-$(read_prev_env RAZORPAY_WEBHOOK_SECRET)}"
NEXT_PUBLIC_RAZORPAY_KEY_ID_VALUE="${NEXT_PUBLIC_RAZORPAY_KEY_ID:-${RAZORPAY_KEY_ID_VALUE}}"

cat > .env.local <<EOF
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=$(read_status API_URL)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(read_status ANON_KEY)
SUPABASE_SERVICE_ROLE_KEY=$(read_status SERVICE_ROLE_KEY)
UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079
UPSTASH_REDIS_REST_TOKEN=local-dev-token
HOSTING_API_BASE=https://api.github.com
HOSTING_ACCOUNT_ID=pagecraft-sites
HOSTING_CREDENTIAL_KEY_ID=test-key
PAGECRAFT_ROOT_DOMAIN=pagecrafts.in
EOF

if [[ -n "${RAZORPAY_KEY_ID_VALUE}" && -n "${RAZORPAY_KEY_SECRET_VALUE}" ]]; then
  {
    echo "NEXT_PUBLIC_RAZORPAY_KEY_ID=${NEXT_PUBLIC_RAZORPAY_KEY_ID_VALUE}"
    echo "RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID_VALUE}"
    echo "RAZORPAY_KEY_SECRET=${RAZORPAY_KEY_SECRET_VALUE}"
    if [[ -n "${RAZORPAY_WEBHOOK_SECRET_VALUE}" ]]; then
      echo "RAZORPAY_WEBHOOK_SECRET=${RAZORPAY_WEBHOOK_SECRET_VALUE}"
    fi
  } >> .env.local
  echo "Razorpay test keys preserved in .env.local."
else
  echo "Razorpay keys not set — Choose Pro/Premium will explain that payments are not configured."
fi

echo "Supabase + Redis/SRH are up and .env.local is written. Dev server starts in the next-dev terminal."
