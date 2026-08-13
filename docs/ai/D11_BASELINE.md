# R5 · AI — D11 quality baseline

Owner: Hanish (R5 · AI). The corpus, the grader and the ranking machinery for the
30-vertical quality pass.

> **Status: machinery landed, baseline measured on 12 Aug 2026.**
>
> The tables below are from `evals/grader/results/2026-08-12T18-00-38-385Z-baseline-full`.
> Twenty-one of thirty verticals never reached a page — Groq 429 / timeout, then
> Gemini's 20 RPD. The nine that completed all passed. That is a capacity
> finding, not a quality finding, and the two must not be averaged together.

---

## The capacity gate, restated

The schedule's errata puts a hard gate before D11: Gemini billing, or the corpus
shrinks to ~2 verticals and the *90% of 30* metric is renegotiated.

**That arithmetic is against the wrong provider.** `AI_PROVIDER_ORDER` is
`groq,gemini` — Gemini is the *last* fallback, not the head of the chain. The
gate is real but much softer than written:

| | Requests/day | Tokens/day | Full generations/day | Binding limit |
|---|---|---|---|---|
| **Groq free** (head of chain) | 1,000 | 200,000 | **18** | tokens/day |
| Gemini free (final fallback) | 20 | — | ~1–2 | requests/day |

One measured generation is ~10 requests and ~9,426 tokens (D5 spike, `analyse()`
in `evals/spike/analysis.ts`). At 15% headroom that is **18 generations a day on
the free tier we are already using**.

The whole three-day programme, in generations rather than requests:

| Block | Generations | Days on Groq free |
|---|---|---|
| D11 corpus, 30 verticals | 30 | 1.7 |
| D11 targeted re-run after quick wins | ~5 | 0.3 |
| D12 regression re-run, all 30 | 30 | 1.7 |
| D12 sampling sweep (plan-only, 6 verticals × 6 configs) | ~18 equivalent | 1.0 |
| D13 injection corpus | 0 | 0 — runs offline, see below |
| **Total** | **~83** | **≈ 5 days** |

**So D11 can run at the full 30 verticals without billing**, over about two days,
and the *90% of 30* metric does not need renegotiating. Billing is still worth
having — it collapses five days of waiting into an afternoon, and at the
amendment's pricing the whole programme is a bit over a dollar — but it is a
convenience, not a gate. The D5 escalation should be re-framed on that basis
rather than as a blocker.

Two further corrections to the errata's arithmetic:

- **The binding limit on Groq is tokens/day, not requests/day.** A request-only
  model predicts 85 generations a day and is wrong by a factor of nearly five.
  `tests/unit/ai/capacity-analysis.test.ts` pins this.
- **D13 costs nothing.** The injection corpus is graded against our own
  containment, sanitiser and patch construction, all of which are deterministic.
  It runs in CI on every PR with no provider. The errata budgeted ~40 requests
  for it; the real figure is zero.

---

## What landed

| File | What it is |
|---|---|
| `evals/corpus-30.json` | 30 verticals: 18 with no template, 8 with, 2 adversarial, 2 non-Latin-script |
| `evals/grader/index.ts` | Objective grade per vertical, and the human sheet |
| `evals/grader/diversity.ts` | R-NEW-C — art-direction spread across the corpus |
| `evals/grader/taxonomy.ts` | Failure clustering, ranked by count × impact |
| `evals/grader/adapt.ts` | Pipeline result → graded outcome, deriving `failureStage` |
| `evals/grader/run.ts` | `npm run grade` |

```bash
npm run grade
```

`--mock` runs the whole thing with no provider (useful for checking the harness,
useless for measuring quality). `--only=v03,v07` re-runs named verticals, which
is what the "quick wins, re-run affected verticals only" block needs.
`--budget=N` caps provider calls and stops cleanly rather than eating a day's
quota.

### Corpus composition

Eighteen of thirty is not a representative sample of businesses. It is a
representative sample of *the thing that might not work* — a vertical with no
hand-authored template to fall back on. The eight with templates are the control
group, so the report is two numbers rather than one: without them, "we got 73%"
says nothing about whether the hard cases are the ones failing.

`expect.mustHave` / `shouldNotHave` are what make section appropriateness partly
automatic. A dentist's site with a `menu` section is wrong and a machine can say
so.

**`expect.category` is a list, not a single value.** The category enum ships
genuine synonyms — `health`, `healthcare`, `health_wellness`, `wellness` — and
grading a dentist wrong for answering `healthcare` instead of `other` would be a
measurement defect, not a finding. Same class of error as the D8 P95 figure that
was counting pacing as provider time.

### Three grading rules

- **`completed` is not `passed`.** AC-F4-1 asks for valid, non-blank, *without
  fallback*. A vertical that fell back to a template finished and failed the
  quality bar. Two columns, never one.
- **Human rows default to `null`.** `summariseHuman()` refuses to average a
  partly-read column and reports the unread count instead. Thirty rows and an eye
  on the clock is exactly when a `3` gets typed for something nobody read.
- **`failureStage` is required on every failure.** The type makes it impossible
  to construct a failed outcome without one, so the compiler enforces it rather
  than a reviewer. "Generation is flaky" is not actionable; "eleven of thirty
  failed at fill on list-heavy sections" is.

`categoryCorrect` and `variantsDistinct` are reported but deliberately do **not**
gate `passed` — a right-looking page filed under a defensible neighbouring
category is not a product failure.

---

## A defect found while building this, and fixed

The classify contract validated against **17 categories while the type, the
prompt and the provider schema all carried 38**. `satisfies z.ZodType<Category>`
does not catch a *narrower* enum, so it drifted silently as the library grew.

The effect: 21 of 38 categories — `healthcare`, `beauty`, `real_estate`,
`retail`, `finance`, `personal` and fifteen more — were offered to the model,
accepted by the provider schema, and then **silently rewritten to `other`** by
`classification`, which also set `fallback: true` on the result.

That is not a small measurement wrinkle. Most of this corpus is health, trade and
retail verticals; a baseline taken before the fix would have shown
`wrong-category` at the top of the taxonomy for a reason that has nothing to do
with any prompt, and D12 would have spent its one tuning slot chasing it.

It was **already biting**: `tests/unit/ai/corpus.test.ts` was failing on `main`
for exactly this reason before any of this work started.

Fixed by making `CATEGORY_IDS` in `src/lib/contracts/template.ts` the single
list, with exhaustiveness checks in both directions, and deriving the contract
validator, the prompt's offer list and the provider schema from it. The test that
pinned the stale seventeen now pins the invariant instead.

---

## Results

Run: `evals/grader/results/2026-08-12T18-00-38-385Z-baseline-full`
Provider order: Groq `openai/gpt-oss-120b` → Gemini `gemini-3.5-flash` · prompts v1.

### Pass rate

| Group | Passed | Total | Rate |
|---|---|---|---|
| Overall | 9 | 30 | 30% |
| **Completed (the quality sample)** | **9** | **9** | **100%** |
| **No template** (the claim under test) | 9 | 18 | 50% |
| Template (control) | 0 | 8 | 0% |
| Adversarial | 0 | 2 | 0% |
| Non-Latin-script | 0 | 2 | 0% |

The control group, the adversarial pair and the non-Latin pair all sit after the
quota cliff. Interleaving (added after this run) exists so a partial re-run
samples every group; this baseline did not have it, which is why every pass is
a no-template vertical.

`completedButFailed` is **0**. Every vertical that produced a page passed the
objective bar without fallback.

### Diversity — R-NEW-C

Measured on the nine completed pages only.

| Metric | Value | Limit |
|---|---|---|
| Dominant theme share | clinical-blue 22% | ≤ 0.30 |
| Dominant motion share | **calm 56%** | ≤ 0.40 |
| Distinct variant sets | 8 / 9 | — |

**Headline: motion collapsed, theme did not.** Five of eight themes appeared in
nine pages. Motion failed the 40% cap because `calm` took half the corpus.
That is the D12 input: if a tuning slot is spent on art direction, spend it on
motion, not theme.

### Failure clusters

Ranked by count × impact. Every cluster is a provider outage, not a prompt
failure — D12 must not chase these.

| # | Stage | Symptom | Count | Verticals |
|---|---|---|---|---|
| 1 | fill | timeout | 11 | driving-school, packers-movers, residents-association, physiotherapy, tuition-centre, wedding-planner, electrician, accountant, restaurant, portfolio, saas |
| 2 | profile | provider-error | 7 | shop, blog, agency, unspecified, vague-modern, sweet-shop, saree-shop |
| 3 | plan | timeout | 1 | music-school |

### Human columns _(unread)_

| Column | Mean | Unread |
|---|---|---|
| copySensible | null | 30 |
| sectionSelectionAppropriate | null | 30 |
| artDirectionAppropriate | null | 30 |

A blank sheet is in the results directory. Means stay `null` until a column is
fully read.

### Spend

| | Requests | Tokens |
|---|---|---|
| Baseline run | 163 | 195,358 |
| Completed verticals only | 91 | 96,595 |

### NFR-003 — first clean figure

`latencyMs` on this run excludes pacing and Retry-After. On the nine completed
verticals:

| Figure | Value | Budget |
|---|---|---|
| Mean model time | 19.6s | 45s |
| P95 model time | **27.4s** | 45s |
| Max | 27.4s (hospital) | 45s |

**Met**, on the sample that finished. It is not a 30-vertical P95. A third
corpus run that actually completes 30 is still the number to publish; this is
the first number that is allowed to be compared with the requirement at all.

---

---

## Ordering note for whoever runs this

D13's containment envelope (`src/lib/ai/containment/`) is **already wired into
every generation call site**, so the text reaching the provider now carries a
`<data-nonce>` boundary and a containment paragraph that the D5 and D8
measurements did not have.

That is a change to the effective prompt, and it landed before the baseline was
taken rather than after. It is the right order — containment is what ships, so
the baseline should measure what ships — but it does mean **the D11 figures are
not comparable to the D5/D8 numbers.** Do not put them in the same table.

---

## Carried forward

| Item | Why |
|---|---|
| Finish the 30 | Quota, not quality — 9/9 completed passed; 21 never started a page |
| Read the 30 outputs | Three human columns; not machine-derivable |
| Motion diversity | `calm` at 56% — the one D12-shaped finding from this run |
| `vertical_profiles` table | Migration written (`20260812090000`); needs provisioning by E1 |
| Gallery category filter | Three pre-existing failures in discovery, unrelated to this work |
