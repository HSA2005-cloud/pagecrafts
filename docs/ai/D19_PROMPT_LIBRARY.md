# R5 · AI — D19 prompt library

Owner: Hanish (R5 · AI). The inventory, generated.

> **Status: complete.** `docs/ai/PROMPT_LIBRARY.md` is produced by
> `npm run prompts:doc` and a test fails if the committed copy drifts.

A hand-written inventory of prompts is out of date the first time someone
adds a version, and a stale reference is worse than none — it is the
document people trust while it lies.

See `docs/ai/PROMPT_LIBRARY.md` for the live table: every file, which stage
is actually running it, the variables each one takes, the per-section
guidance, and the containment split (which is not visible in any prompt
file).

## Acceptance

| Criterion | State |
|---|---|
| Generated, not handwritten | ✅ |
| CI fails on drift | ✅ `tests/unit/ai/prompt-library.test.ts` |
| Lists every prompt on disk | ✅ |
| Names the live version per stage | ✅ |
| Containment split documented | ✅ |
