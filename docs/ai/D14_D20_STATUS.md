# R5 · AI — D14 to D20 status

Owner: Hanish (R5 · AI). What landed against the AI column of the D1–D20 grid
(timeline v2.1, pages 9–10, plus the v2.0 amendment's D14 and D16 corrections).

| Day | Deliverable | State |
|---|---|---|
| D14 | Deterministic ranking; art direction dials fully wired, themes 3 → 8 | ⚠️ dials built; **nothing renders them yet** |
| D15 | 90% of 30 verticals sensible; injection contained | ⚠️ capacity-blocked; containment ✅ |
| D16 | Final prompt tuning; motion budget + diversity in the composition validator | ✅ validator · ❌ tuning |
| D17 | Cost dashboard | ✅ |
| D18 | Verify caps under real load | ❌ needs billing |
| D19 | Document prompt library | ✅ |
| D20 | Cost-per-user is a known number | ⚠️ machinery ✅, number needs paid usage |

## The dependency that gates D14 and D15

**There is still no composition renderer.** Nothing in the repo turns a
`Composition` into HTML or a file map: there is no `src/components/sections`, and
`compositionShell()` and `artDirectionCss()` are called by their own tests and
nothing else. The job runner produces a validated `Composition` and stops there,
exactly as it did at D9.

That bounds two days honestly:

- **D14 is "dials built and unit-tested", not "fully wired".** The CSS is correct
  and 600 combinations are asserted, but no page has ever been rendered with it,
  so no dial has been seen.
- **D15's "end to end live" cannot be met from this column at all.** A generation
  cannot reach a user without a renderer, regardless of quality or quota.

The renderer is Preethi's (E2/E4), due D4 in the v2.0 amendment's corrected grid.
Until it lands, the AI column can produce and validate compositions but cannot
demonstrate one.

---

## D14 — art direction dials

**The dials were not wired at all.** All five were chosen by the profile stage,
validated by the schema and stored on the composition — then rendered by nothing.
`pageShell` had no callers; `radiusId`, `spacingId` and `imageryId` appeared only
in the prompt that produced them and the schema that checked them. Eight themes
were *declared* and none had a stylesheet. A dentist and a nightclub got
identical pages with different words.

`src/lib/render/art-direction.ts` closes it:

- **8 themes**, each a full palette plus a display face, weight and tracking —
  `Record<ThemeId, Theme>`, so a ninth theme fails to compile until defined.
- **5 corner styles, 3 spacing steps, 5 photographic treatments**, all emitted as
  custom properties.
- `compositionShell()` will render a composition with every dial applied — once
  something calls it. Today nothing does; see the dependency note above.

The variable names are deliberately the ones `templates/blueprint.ts` already
emits — `--bg`, `--ink`, `--muted`, `--accent`, `--panel`, `--rule` — so a section
component cannot tell whether a template or a composition produced the page it is
rendering into.

600 dial combinations are asserted to produce balanced, complete CSS.

Deterministic ranking is unchanged and still drives template fallback and the
gallery, as the amendment specifies.

## D16 — motion budget and diversity in the validator

`src/lib/ai/composition/validate.ts`, wired into the job runner after `assemble`.

The D11 grader asks these questions across a corpus, after the fact. That is the
right place to find a systemic problem and the wrong place to stop — by the time
a corpus run notices, the page has been built and shown to someone. The validator
asks them of a single composition, at generation time, where they can be
repaired.

**Motion budget.** Sections animate on scroll with a per-index stagger, so motion
cost grows with section count, not just with the setting. The span — when the last
section finishes animating — is capped at 2,000ms. Over that, the motion is
replaced with the most expressive option that still fits.

One thing worth knowing, because it contradicts the obvious design: **aesthetic
calm and motion cost are different orderings.** `kinetic` spans *less* than `calm`
on a short page (it is fast, 400ms, despite a wider stagger), and they swap as the
page grows and stagger comes to dominate duration. A hand-written "calmest first"
ladder is therefore wrong at one end or the other — the first version of this file
had one, and a test caught it. The ladder is now computed from the stylesheet at
the page's actual length.

The numbers come from parsing `motion.css` rather than being restated in
TypeScript, for the same reason the category enum is derived: a hand-copied table
is correct the day it is written and silently wrong the first time someone tunes a
transition.

**Diversity.** Variant monotony, adjacent variant repeats, and art direction that
contradicts itself. Recorded as warnings; they never reject a page — a samey page
is still a page, and refusing to ship it helps nobody.

**Final prompt tuning is not done**, but it is no longer input-less. Reading the
nine completed pages found one real prompt-level cluster — two of nine shipped an
unfilled placeholder in the `about` section ("Founded in [year]") — plus invented
phone numbers and invented named doctors. All three are exactly what the v2
guidance blocks were written for, and none of that guidance reached the model,
because this run used v1. That is a concrete before/after to measure rather than a
taste-driven guess; it still needs the quota to run it.

## D17 — cost dashboard

`src/lib/ai/cost/dashboard.ts` + `npm run cost`.

The ledger prices one generation; this aggregates many, which is a different
question — not "what did that cost" but "what are we spending, on what, and can we
reconcile it against the invoice" (NFR-142).

Slices by provider, stage, model, prompt version and day. Invoice reconciliation
with a 5% tolerance, flagging any provider the ledger never saw. Everything is a
pure function over rows, so it runs against either the `generations` table or an
eval run on disk — today the latter, because the table is not yet carrying rows.

Against the real baseline run: 163 calls, 195,358 tokens, 2.5% failure rate,
Groq 145 / Gemini 18.

**One thing the dashboard now refuses to do quietly.** It reports ₹0.00, which is
correct on a free tier — but the identical zero would appear after billing is
enabled if the per-provider rate card in config were left unset, and D20's
"cost-per-user is a known number" would be false while looking finished. The
dashboard distinguishes the two: *unpriced is not free*, and it says so.

## D19 — prompt library

`docs/ai/PROMPT_LIBRARY.md`, generated by `npm run prompts:doc`.

Every prompt on disk with its id, version, tier, digest and purpose; which version
each stage is actually running and the env var that sets it; every placeholder
split into registry lists and per-call values with the source of truth for each;
the per-section-type guidance blocks; and the containment split of what is trusted
at each stage.

Generated rather than written, and a test asserts the committed copy matches the
generator. A hand-maintained inventory is out of date the first time someone adds
a version, and a stale reference is worse than none — it is the document people
trust while it lies.

## D15, D18, D20 — what capacity blocks

**D15 — "90% of 30 verticals sensible."** The baseline run completed 9 of 30 and
7 of those passed; the two failures are one fixable `about`-section defect. The
remaining 21 never produced a page: the run hit Groq's 200,000 token/day ceiling.
The milestone is unevidenced rather than failed.

Injection containment, the milestone's other half, **is** met and runs in CI on
every PR at no provider cost.

A methodology defect the run exposed: the corpus was walked in file order, so all
nine completions were no-template verticals and the control group never ran. The
runner now interleaves the four groups by default, so the next partial run samples
all of them proportionately. That single change is what makes a quota-limited run
scientifically useful.

**D18 — "verify caps under real load."** Not attempted. A load test needs headroom
the free tier does not have; running one would exhaust the day's quota and measure
the rate limiter rather than the caps.

**D20 — "cost-per-user is a known number."** The machinery computes it and
excludes unattributed spend, so an eval run cannot flatter it. The number itself
needs paid usage by real users, which is a launch-day input.

---

## The through-line

Three of these days were blocked on capacity and three were not, and the three
that were not turned out to contain the substantive gaps: art direction that was
chosen but never rendered, a motion system with no budget, and a cost dashboard
that would have reported a confident zero forever.

None of those needed a provider to find. All three would have shipped invisible.

What remains is not mostly a quality problem. It is two external dependencies —
the composition renderer, and provider capacity — and one item (final prompt
tuning) waiting on data the capacity limit has not yet produced.
