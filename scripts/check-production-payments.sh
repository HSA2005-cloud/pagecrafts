#!/usr/bin/env bash
# Probe https://pagecrafts.in for payments readiness (no secrets printed).
set -euo pipefail

URL="${1:-https://pagecrafts.in/plans}"
API="${2:-https://pagecrafts.in/api/v1/account/billing/checkout}"

echo "Checking production payments: $URL"
HTML="$(curl -fsSL "$URL")"

if echo "$HTML" | grep -q '"paymentsReady":true'; then
  echo "  paymentsReady: true  (RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET appear set)"
else
  echo "  paymentsReady: false (RAZORPAY keys missing in Vercel Production — see docs/production-payments-setup.md)"
fi

CODE="$(curl -s -o /tmp/pc-checkout.json -w "%{http_code}" -X POST "$API" \
  -H 'content-type: application/json' -d '{"plan":"pro"}')"
echo "  POST /api/v1/account/billing/checkout (no auth): HTTP $CODE"
if [ -f /tmp/pc-checkout.json ]; then
  head -c 200 /tmp/pc-checkout.json
  echo
fi

echo "  server: $(curl -sI "$URL" | grep -i '^server:' | tr -d '\r')"
