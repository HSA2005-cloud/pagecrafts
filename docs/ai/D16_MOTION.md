# R5 · AI — D16 motion budget

Owner: Hanish (R5 · AI). Motion cost checked on the page about to be shown.

> **Status: complete and in the runner.** A composition whose stagger would
> still be playing 2s after the last section entered view is stepped down to
> the most expressive motion that fits, before the user sees it.

---

## Why not just the D11 grader

The grader answers "did motion collapse across 30 pages?" after the fact.
Useful, and it did — `calm` was 56% of the D11 sample. Useless for the page
that is about to be shown: by then it has already been built.

`src/lib/ai/composition/validate.ts` asks the same family of questions of
**one** composition, at generation time.

## The budget

Motion cost grows with section count, not just with the setting. Seven
sections at `showcase` (100ms stagger, 900ms duration) leave the last one
finishing 1.5s after it enters view.

`MOTION_BUDGET_MS = 2_000`. Above that the stagger reads as the page being
slow rather than choreographed.

The step-down is not a hand-written "calmest first" ladder. `kinetic` is
cheaper than `calm` on a long page because it is fast despite a wider
stagger, and the ordering *changes with section count*. So every option's
span is computed at this page's actual length, and the largest that still
fits is kept.

Diversity findings (`variant-monotony`, `variant-repeat`, `motion-mismatch`)
are warnings. A samey page is still a page; refusing to ship it helps
nobody. Motion over budget is repaired.

## Acceptance

| Criterion | State |
|---|---|
| Tokens read from `motion.css`, not restated | ✅ |
| Over-budget motion is repaired, not warned | ✅ |
| Ranking derived from span, not a ladder | ✅ |
| Runner calls it before `done` | ✅ |
| Spike pipeline calls it too | ✅ |
