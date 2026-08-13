# R5 · AI — D11 to D20

Owner: Hanish (R5 · AI). Week 3 (quality) and week 4 (hardening), against
the same rule the D6–D10 notes used: what landed, what did not, and why.

---

## Day by day

| Day | Deliverable | State |
|---|---|---|
| D11 | 30-vertical baseline, grader, taxonomy | ✅ machinery + a run. 9/9 completed passed; 21 died on quota |
| D12 | v2 prompts, compare, sweep, profile cache | ✅ v2 selectable. Comparison not run — D11's failures were quota, not copy |
| D13 | Injection containment, CI weakening | ✅ 29 cases, every PR |
| D14 | Art-direction dials → CSS | ✅ |
| D15 | Composition → files; NFR-003; quality milestone | ✅ seam closed. 90%-of-30 **not** claimed |
| D16 | Motion budget on the page being shown | ✅ in the runner |
| D17 | Cost dashboard, NFR-142 | ✅ pure function; table still E1 |
| D18 | Load | ✅ mock + limiter fix. Live concurrency needs paid TPM |
| D19 | Prompt library, generated | ✅ |
| D20 | Cost per user is a known number | ✅ ₹0.00 unpriced now; ~₹0.31/site at paid Groq |

## Scripts restored

`grade`, `grade:mock`, `sweep`, `compare`, `load`, `cost`, `prompts:doc`
were added on D11–14 and dropped in a later `package.json` merge. They are
back.

## Still not ours to close

| Item | Owner |
|---|---|
| `generations.provider` / `prompt_version` / `latency_ms` / `stage` | E1 |
| `vertical_profiles` table provisioned | E1 |
| Groq/Cerebras training-data terms (A3 Gate 1) | Hanish, still open, blocks beta |
| Cerebras funding | one line in `AI_PROVIDER_ORDER` |
| Human 1–5 columns on the corpus | a reading, not a program |
| Live 30-vertical re-run | quota or billing |
