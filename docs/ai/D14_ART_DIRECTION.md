# R5 · AI — D14 art direction

Owner: Hanish (R5 · AI). The five dials, wired to CSS.

> **Status: complete.** A dentist and a gym no longer share a page with
> different words. Every registered theme, radius, spacing and imagery id has
> a definition, and `compositionShell` puts them on the generated page.

---

## What was wrong

The profile stage has chosen `themeId`, `motionId`, `radiusId`, `spacingId`
and `imageryId` since D1. The schema validated them. The composition stored
them. Nothing read them except the prompt that produced them.

`themeId` reached no stylesheet. The other four were not referenced outside
the AI module. Generated pages were one look.

## What landed

| File | What it does |
|---|---|
| `src/lib/render/art-direction.ts` | Eight themes (the v2.0 amendment), five radii, three spacings, five imagery treatments — as custom properties the templates already speak (`--bg`, `--ink`, `--accent`, …) |
| `src/lib/render/page-shell.ts` | `compositionShell` — art direction + motion.css + motion.js around a body |
| `src/lib/render/motion-tokens.ts` | Duration/stagger/distance read from `motion.css`, never restated |
| `tests/unit/ai/art-direction.test.ts` | Every combination the schema permits emits valid CSS; a clinic and a gym differ |

Section components stay ignorant of art direction. They reference
`var(--accent)` and the dials decide what that means — the same separation
C-04 draws between the model and the markup, one level down.

## Acceptance

| Criterion | State |
|---|---|
| All eight themes defined | ✅ |
| Radius, spacing, imagery have a definition per id | ✅ |
| Custom properties match the template vocabulary | ✅ |
| A clinic and a gym produce different CSS | ✅ |
| Motion stylesheet and observer ship with the page | ✅ |
