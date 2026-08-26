import type {
    ArtDirection, ImageryId, RadiusId, SpacingId, ThemeId,
} from '@/lib/contracts';

/**
 * D14 — the art-direction dials, wired to CSS.
 *
 * Until now all five dials were chosen by the profile stage, validated by the
 * schema, stored on the composition — and then rendered by nothing. `themeId`
 * reached no stylesheet, and `radiusId`, `spacingId` and `imageryId` were not
 * read anywhere outside the prompt that produced them. A dentist and a
 * nightclub got identical pages with different words.
 *
 * The custom-property names are deliberately the ones `templates/blueprint.ts`
 * already emits (`--bg`, `--ink`, `--muted`, `--accent`, `--panel`, `--rule`),
 * so a generated composition and a hand-authored template speak one language
 * and a section component does not care which produced it.
 */

export interface Theme {
    label: string;
    bg: string;
    ink: string;
    muted: string;
    accent: string;
    /** Text that sits on top of `accent`. */
    accentInk: string;
    panel: string;
    rule: string;
    /** Display face for headings; body stays on the system stack for load cost. */
    displayFont: string;
    /** Heading weight and tracking carry as much character as colour does. */
    displayWeight: number;
    displayTracking: string;
}

/**
 * `Record<ThemeId, …>` on purpose: a ninth theme fails to compile until it has
 * a definition here, the same guard `CATEGORY_LABELS` uses.
 */
export const THEMES: Record<ThemeId, Theme> = {
    'clinical-blue': {
        label: 'Clinical blue',
        bg: '#ffffff', ink: '#0f172a', muted: '#64748b',
        accent: '#0369a1', accentInk: '#ffffff',
        panel: '#f1f5f9', rule: '#e2e8f0',
        displayFont: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
        displayWeight: 600, displayTracking: '-0.01em',
    },
    'warm-editorial': {
        label: 'Warm editorial',
        bg: '#fffdf9', ink: '#1c1917', muted: '#78716c',
        accent: '#b45309', accentInk: '#ffffff',
        panel: '#f5f0e8', rule: '#e7e0d5',
        // Pro display: Newsreader (loaded for Photo-rich) — not Free's plain Georgia.
        displayFont: 'Newsreader, "Iowan Old Style", Palatino, "Book Antiqua", Georgia, serif',
        displayWeight: 500, displayTracking: '-0.028em',
    },
    'deep-luxury': {
        label: 'Deep luxury',
        bg: '#0c0a09', ink: '#fafaf9', muted: '#a8a29e',
        accent: '#c8a962', accentInk: '#0c0a09',
        panel: '#1c1917', rule: '#292524',
        // Premium signature: Bodoni Moda (loaded for Animated) — high-contrast Didot, not Impact sans.
        displayFont: '"Bodoni Moda", Didot, "Bodoni MT", "Times New Roman", serif',
        displayWeight: 400, displayTracking: '0.04em',
    },
    'vivid-energy': {
        label: 'Vivid energy',
        bg: '#ffffff', ink: '#18181b', muted: '#71717a',
        accent: '#e11d48', accentInk: '#ffffff',
        panel: '#fafafa', rule: '#e4e4e7',
        displayFont: '"Avenir Next", Avenir, "Century Gothic", ui-rounded, system-ui, sans-serif',
        displayWeight: 600, displayTracking: '0.02em',
    },
    'calm-sage': {
        label: 'Calm sage',
        bg: '#fbfdfb', ink: '#1a2e23', muted: '#6b7f72',
        accent: '#4a7c59', accentInk: '#ffffff',
        panel: '#eef4f0', rule: '#dbe6de',
        displayFont: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
        displayWeight: 500, displayTracking: '-0.005em',
    },
    'mono-precision': {
        label: 'Mono precision',
        bg: '#ffffff', ink: '#111111', muted: '#6b6b6b',
        accent: '#111111', accentInk: '#ffffff',
        panel: '#f5f5f5', rule: '#dcdcdc',
        displayFont: 'ui-sans-serif, "Helvetica Neue", Arial, sans-serif',
        displayWeight: 700, displayTracking: '-0.02em',
    },
    'sunlit-craft': {
        label: 'Sunlit craft',
        bg: '#fffaf0', ink: '#2d1e12', muted: '#8a7160',
        accent: '#d97706', accentInk: '#ffffff',
        panel: '#fdf1de', rule: '#f0e0c8',
        // Free: plain, friendly Georgia — Pro uses a richer editorial stack.
        displayFont: 'ui-serif, Georgia, serif',
        displayWeight: 600, displayTracking: '-0.01em',
    },
    'tech-slate': {
        label: 'Tech slate',
        bg: '#0f1115', ink: '#e9edf2', muted: '#8b97a8',
        accent: '#3b82f6', accentInk: '#ffffff',
        panel: '#171a21', rule: '#242833',
        displayFont: '"Avenir Next Condensed", "Helvetica Neue", "Segoe UI", system-ui, sans-serif',
        displayWeight: 500, displayTracking: '0.06em',
    },
};

/** Corner style. `framed` is square with a visible border rather than a radius. */
export const RADII: Record<RadiusId, { sm: string; md: string; lg: string; border: string }> = {
    sharp: { sm: '0', md: '0', lg: '0', border: '1px' },
    soft: { sm: '4px', md: '8px', lg: '14px', border: '1px' },
    pill: { sm: '999px', md: '999px', lg: '28px', border: '1px' },
    organic: { sm: '6px', md: '18px 6px 18px 6px', lg: '32px 8px 32px 8px', border: '1px' },
    framed: { sm: '0', md: '0', lg: '0', border: '2px' },
};

/** Vertical rhythm. The single biggest lever on whether a page feels expensive. */
export const SPACING: Record<SpacingId, { section: string; gap: string; measure: string }> = {
    tight: { section: '3rem', gap: '1rem', measure: '62ch' },
    default: { section: '5rem', gap: '1.5rem', measure: '68ch' },
    airy: { section: '8rem', gap: '2.5rem', measure: '74ch' },
};

/** Photographic treatment, applied to every image the page renders. */
export const IMAGERY: Record<ImageryId, { filter: string; overlay: string }> = {
    'bright-clean': { filter: 'saturate(1.05) contrast(1.02)', overlay: 'transparent' },
    'warm-natural': { filter: 'saturate(1.1) sepia(0.08)', overlay: 'rgba(180,120,60,0.05)' },
    'bold-contrast': { filter: 'contrast(1.18) saturate(1.15)', overlay: 'transparent' },
    'muted-duotone': { filter: 'grayscale(0.55) contrast(1.05)', overlay: 'rgba(30,40,60,0.10)' },
    documentary: { filter: 'grayscale(1) contrast(1.1)', overlay: 'transparent' },
};

/**
 * The whole art direction as custom properties.
 *
 * Emitted as `:root` variables rather than as rules, so section components stay
 * ignorant of art direction entirely — they reference `var(--accent)` and the
 * dials decide what that means. That is the same separation C-04 draws between
 * the model and the markup, one level down.
 */
export function artDirectionCss(art: ArtDirection): string {
    const theme = THEMES[art.themeId];
    const radius = RADII[art.radiusId];
    const spacing = SPACING[art.spacingId];
    const imagery = IMAGERY[art.imageryId];

    return `:root {
  --bg: ${theme.bg};
  --ink: ${theme.ink};
  --muted: ${theme.muted};
  --accent: ${theme.accent};
  --accent-ink: ${theme.accentInk};
  --panel: ${theme.panel};
  --rule: ${theme.rule};

  --display-font: ${theme.displayFont};
  --display-weight: ${theme.displayWeight};
  --display-tracking: ${theme.displayTracking};

  --radius-sm: ${radius.sm};
  --radius-md: ${radius.md};
  --radius-lg: ${radius.lg};
  --border-width: ${radius.border};

  --section-gap: ${spacing.section};
  --stack-gap: ${spacing.gap};
  --measure: ${spacing.measure};

  --image-filter: ${imagery.filter};
  --image-overlay: ${imagery.overlay};
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.6;
}

h1, h2, h3 {
  font-family: var(--display-font);
  font-weight: var(--display-weight);
  letter-spacing: var(--display-tracking);
  line-height: 1.15;
  margin: 0 0 0.5em;
}

p { max-width: var(--measure); }
a { color: inherit; }

section { padding-block: var(--section-gap); }

img {
  max-width: 100%;
  height: auto;
  filter: var(--image-filter);
  border-radius: var(--radius-md);
}`;
}

/** Every dial, for the eval report and the D14 write-up. */
export function describeArtDirection(art: ArtDirection): string {
    return [
        THEMES[art.themeId].label,
        `${art.motionId} motion`,
        `${art.radiusId} corners`,
        `${art.spacingId} spacing`,
        art.imageryId,
    ].join(' · ');
}
