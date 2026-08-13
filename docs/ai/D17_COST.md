# R5 · AI — D17 cost dashboard

Owner: Hanish (R5 · AI). Spend, sliced, and NFR-142 reconciliation.

> **Status: complete as a pure function over rows.** Pointing it at the
> `generations` table is a change of source, not of dashboard. The table is
> still missing four columns (E1).

---

## What it answers

The ledger prices one generation. The dashboard aggregates many:

- what did we spend, on which provider, at which stage, on which prompt version
- what does a user cost (D20)
- can we reconcile against each invoice within 5% (NFR-142)

Eval runs have `userId: null` and are excluded from cost-per-user so they
cannot make launch day look worse than the product is.

Unpriced is not free. A provider that burned tokens at a rate card of zero
is listed separately, because after billing is enabled a confident ₹0.00
would make D20's number false while looking finished.

```bash
npm run cost -- evals/grader/results/2026-08-12T18-00-38-385Z-baseline-full
npm run cost -- --invoice=groq:0,gemini:0
```

## Acceptance

| Criterion | State |
|---|---|
| Totals and slices (provider, stage, model, day, prompt version) | ✅ |
| Cost per user ignores unattributed rows | ✅ |
| Reconciliation within 5% | ✅ `RECONCILE_TOLERANCE_PCT` |
| Unpriced providers called out | ✅ |
| Markdown form for the write-up | ✅ |
| Rows persisted to `generations` | ❌ blocked on E1 |
