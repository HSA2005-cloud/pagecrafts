# R5 · AI — D15 quality milestone

Owner: Hanish (R5 · AI). Week-3 exit: a prompt produces a real site; the
30-vertical quality bar is measured; NFR-003 has a clean figure.

> **Status: the seam is closed, the corpus is not.** A generation now writes
> `index.html`. The D11 baseline's nine completed verticals all passed, all
> under 45s of model time. Twenty-one verticals never got a page because the
> free tier ran out. That is stated as a capacity miss, not a quality pass
> with a 30% rate.

---

## The missing seam, closed

D8 left generation at a `Composition`. Persistence (`putProjectFiles`,
`recordCommit`) was ready. Nothing turned one into the other.

`src/lib/ai/generate/to-files.ts` does. `runJob` attaches a `FileMap` on
`done`. `GET /jobs/{id}` reports `files_ready`. Images stay as search-query
slots — picking a photograph is an editor action and needs an Unsplash id
generation does not have.

A hostile heading is escaped. A hidden section is not rendered. The motion
observer is on every visible section.

## Quality, honestly

From `evals/grader/results/2026-08-12T18-00-38-385Z-baseline-full`:

| Claim | Figure |
|---|---|
| Completed without fallback, non-blank, required sections present | **9 / 9** |
| Corpus pass rate (including quota deaths) | 9 / 30 |
| Control / adversarial / non-Latin | 0 / 12 — never reached, quota |
| `completedButFailed` | 0 |

AC-F4-1 asked for ≥90% of 30. We have 100% of the 9 that ran and 30% of the
30 we named. Publishing 30% as the quality number would be lying with a
true fraction. The number to improve is **how many of 30 we can afford to
run**, not the prompt.

## NFR-003

First figure whose `latencyMs` excludes pacing (the D8 defect):

| | |
|---|---|
| Mean | 19.6s |
| **P95** | **27.4s** |
| Budget | 45s |
| Sample | 9 completed verticals |

Pinned by `tests/unit/ai/nfr-003.test.ts` against the committed grades, so
a future rewrite of the baseline cannot silently drop the requirement.

## What D15 does not claim

- v2 prompts are in production. They are not. See `D12_TUNING.md`.
- The human 1–5 columns have been read. They have not.
- A 30-vertical P95. We do not have one.

## Acceptance

| Criterion | State |
|---|---|
| Composition → `FileMap` | ✅ `to-files.ts`, wired into the runner |
| Generated HTML carries art direction | ✅ |
| NFR-003 on the clean sample | ✅ 27.4s P95 |
| ≥90% of 30 without fallback | ❌ capacity, not quality |
| Failure path still proven | ✅ unchanged from D7 |
