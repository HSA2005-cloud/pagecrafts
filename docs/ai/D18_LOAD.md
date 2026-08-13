# R5 · AI — D18 load

Owner: Hanish (R5 · AI). Overlapping generations, the limiter under contention,
the number a single user never produces.

> **Status: mock load is in CI; live load is a billing day.** Free-tier TPM
> makes concurrent real calls a wall of 429s. That is not a measurement, it
> is the D11 baseline all over again. The tests below run against the mock
> path and the limiter's own clock, which is what can actually fail a PR.

---

## What "load" means here

Not "hit Groq with 50 generations". One generation already exceeds Groq's
8,000 TPM; fifty of them on the free tier is a 429 corpus, which we have.

Load, for this module, is:

1. eight overlapping `runJob` calls all finish `done`, each with an `index.html`
2. the in-memory job store does not drop a concurrent patch
3. two waiters cannot both take the last remaining request on the limiter
4. a reservation that is later recorded is not double-counted
5. the dashboard can total five concurrent ledgers without losing a row

```bash
npx vitest run tests/unit/ai/load.test.ts
npm run load -- --n=12 --concurrency=4
```

## A defect the load tests found, and fixed

`RateLimiter.acquire` used to be a pure wait. Two callers could both see an
empty window, both proceed, and over-admit. Under a one-at-a-time eval that
never shows; on launch day it is how you 429 yourself.

Acquire is now serialised, and it **reserves** the estimated tokens before
returning so the next waiter sees the budget as spent. `record` replaces the
reservation with the actual cost, so a recorded call is not counted twice.

## Live load

Amendment A3 put D18 on Groq/Cerebras free tiers as well as Gemini billing.
The arithmetic still holds for a *serial* corpus, not for concurrency: the
binding limit is tokens per minute, and one generation is already 1.2× it.
A concurrent live run needs the paid TPM, or it is another 429 table.

## Acceptance

| Criterion | State |
|---|---|
| Concurrent mock jobs complete with files | ✅ |
| Limiter does not over-admit under overlap | ✅ |
| Reservation is not double-counted | ✅ |
| `npm run load` harness | ✅ mock |
| Live concurrent run against paid TPM | ❌ billing |
