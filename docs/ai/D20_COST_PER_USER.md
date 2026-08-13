# R5 · AI — D20 cost per user

Owner: Hanish (R5 · AI). The number, and what would change it.

> **Status: the number is known, and it is two numbers.** On the free tier we
> actually ran, cost-per-user is **₹0.00 and unpriced**. At Groq's published
> paid rates for `gpt-oss-120b`, one completed generation is about **₹0.31**.
> Unpriced is not free; the dashboard refuses to render them identically.

---

## How the number is made

`buildDashboard` divides attributed spend by distinct users. Eval rows have
no user and are excluded, so a corpus run cannot drag the launch-day figure.
A generation is several calls; they are grouped by user + minute.

```bash
npm run cost -- evals/grader/results/2026-08-12T18-00-38-385Z-baseline-full
```

The D11 baseline's 163 calls / 195,358 tokens were all unattributed (an eval
run) and priced at a rate card of zero, so the dashboard reports:

| Metric | Value |
|---|---|
| Cost per user | — (no attributed usage) |
| Unpriced providers | groq, gemini |
| Total (ledger) | ₹0.00 |

That is the honest free-tier answer. It is also why `unpricedProviders` exists.

## The paid-rate estimate

Using Groq's published paid rates for `openai/gpt-oss-120b` at time of
writing — **$0.15 / 1M input, $0.60 / 1M output** — applied to the nine
completed D11 verticals (96,595 tokens, ~57% input from the D8 mix):

| | |
|---|---|
| Cost of nine completed generations | ~$0.033 |
| **Cost per generation** | **~$0.0037 · ~₹0.31** |
| Cost per user, one site | ~₹0.31 |
| Cost per user, three sites | ~₹0.93 |

Gemini's 21 failed verticals burned tokens too; they are waste, not a user's
cost, and they go to zero once the head of the chain has quota.

These rates are an estimate for after billing, not an invoice. NFR-142
(reconcile within 5%) cannot be claimed until there is an invoice to
reconcile against. The machinery is in `reconcile()`.

## What would change it

- Filling in `GROQ_PRICE_*` / `GEMINI_PRICE_*` in config, so the ledger
  stops reporting zero on a paid key.
- Attributing `userId` on live `generations` rows (E1, the four missing
  columns).
- A repair rate that is not ~zero — a second fill call is another ~₹0.04.
- Switching `AI_PROVIDER_ORDER`. This number is a claim about Groq
  `gpt-oss-120b` (A3 §6 Gate 2).

## Acceptance

| Criterion | State |
|---|---|
| Cost-per-user is a computed field, not a guess | ✅ |
| Unattributed spend excluded | ✅ |
| Unpriced ≠ free | ✅ |
| A number published for launch | ✅ ₹0.00 unpriced now; ~₹0.31/site at paid Groq |
| Reconciled to an invoice within 5% | ❌ no invoice yet |
