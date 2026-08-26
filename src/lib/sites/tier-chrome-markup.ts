/**
 * Shared HTML/CSS chrome for catalogue templates and AI-generated sites.
 * Starter = sidebar + simple image hero; Pro = blended top bar; Premium = liquid deck.
 */

import type { ChromeKind } from "@/lib/sites/tier-chrome";

export function escapeChrome(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function navLinksHtml(
    items: readonly { href: string; label: string; current?: boolean }[],
): string {
    return items
        .map((item) => {
            const current = item.current ? ' aria-current="page"' : "";
            return `<a href="${escapeChrome(item.href)}"${current}>${escapeChrome(item.label)}</a>`;
        })
        .join("\n");
}

export function chromeHeaderHtml(opts: {
    kind: ChromeKind;
    title: string;
    homeHref: string;
    navInner: string;
}): string {
    const title = escapeChrome(opts.title);
    const home = escapeChrome(opts.homeHref);

    if (opts.kind === "sidebar") {
        return `<aside class="site-sidebar" aria-label="Site pages">
  <a class="wordmark" href="${home}">${title}</a>
  <nav class="nav" aria-label="Site">
${opts.navInner}
  </nav>
</aside>`;
    }

    if (opts.kind === "liquid") {
        return `<header class="site-liquid-bar">
  <a class="wordmark" href="${home}">${title}</a>
  <nav class="nav" aria-label="Site">
${opts.navInner}
  </nav>
</header>`;
    }

    return `<header class="site-topbar site-topbar-blend">
  <a class="wordmark" href="${home}">${title}</a>
  <nav class="nav" aria-label="Site">
${opts.navInner}
  </nav>
</header>`;
}

/** CSS shared by catalogue blueprints and AI compositionToFiles. */
export function tierChromeCss(kind: ChromeKind): string {
    if (kind === "sidebar") {
        return `
.site-shell { display: grid; min-height: 100svh; min-height: 100dvh; grid-template-columns: minmax(11rem, 15rem) minmax(0, 1fr); }
.site-sidebar {
  position: sticky; top: 0; align-self: start; height: 100svh; height: 100dvh;
  display: flex; flex-direction: column; gap: 1.25rem;
  padding: 1.5rem 1.15rem; border-right: 1px solid var(--rule, #e5e5e5);
  background: color-mix(in srgb, var(--panel, #f4f4f5) 88%, transparent);
}
.site-sidebar .wordmark { font-weight: 700; text-decoration: none; letter-spacing: -0.02em; }
.site-sidebar .nav { display: flex; flex-direction: column; gap: 0.35rem; }
.site-sidebar .nav a {
  display: block; padding: 0.55rem 0.7rem; border-radius: 0.55rem;
  color: var(--muted); text-decoration: none; font-size: 0.9rem;
}
.site-sidebar .nav a:hover,
.site-sidebar .nav a[aria-current="page"] {
  color: var(--ink); background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.site-main {
  min-width: 0; display: flex; flex-direction: column;
  min-height: 100svh; min-height: 100dvh;
  justify-content: safe center; align-items: center; text-align: center;
}
.site-main .hero {
  flex: 1 1 auto;
  display: flex; flex-direction: column; align-items: center; justify-content: safe center;
  text-align: center;
  min-height: min(88svh, 44rem); min-height: min(88dvh, 44rem);
  width: 100%;
}
.site-main .hero-copy {
  margin-inline: auto; text-align: center; max-width: 36rem;
}
.site-main .section, .site-main .footer {
  text-align: center; max-width: 42rem; margin-inline: auto; width: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: safe center;
}
.site-main .section {
  min-height: min(70svh, 36rem); min-height: min(70dvh, 36rem);
  padding-block: 2.5rem;
}
.site-main .hero-frame,
.site-main [data-type="hero"] .img-slot {
  border-radius: 0.75rem; min-height: 14rem; max-width: 28rem; margin-inline: auto;
}
@media (max-width: 48rem) {
  .site-shell { grid-template-columns: 1fr; min-height: 100svh; }
  .site-sidebar {
    position: static; height: auto; flex-direction: row; flex-wrap: wrap;
    align-items: center; justify-content: center; border-right: 0;
    border-bottom: 1px solid var(--rule, #e5e5e5);
    padding: 0.85rem 1rem;
  }
  .site-sidebar .nav { flex-direction: row; flex-wrap: wrap; justify-content: center; }
  .site-main {
    min-height: calc(100svh - 4rem);
    justify-content: safe center;
    align-items: center;
    text-align: center;
  }
  .site-main .hero {
    min-height: min(80svh, 36rem);
    justify-content: center;
    align-items: center;
    padding: 1.75rem 1rem 2rem;
  }
  .site-main .section, .site-main .footer {
    padding-inline: 1rem;
    text-align: center;
    margin-inline: auto;
  }
  .site-main .section {
    min-height: min(70svh, 32rem);
    padding-block: 2rem;
  }
  .site-main .hero-frame,
  .site-main [data-type="hero"] .img-slot {
    min-height: 11rem; max-width: min(100%, 22rem); margin-inline: auto;
  }
}
@media (min-width: 48.01rem) and (max-width: 64rem) {
  .site-main .hero {
    min-height: min(84svh, 40rem); min-height: min(84dvh, 40rem);
  }
  .site-main .section {
    min-height: min(72svh, 34rem); min-height: min(72dvh, 34rem);
  }
}
`;
    }

    if (kind === "topbar") {
        return `
.site-topbar,
.site-topbar-blend {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 0.75rem 1.5rem; padding: 0.85rem 1.5rem;
  position: sticky; top: 0; z-index: 8;
  background: color-mix(in srgb, var(--bg, #fff) 72%, transparent);
  backdrop-filter: blur(14px) saturate(1.15);
  border-bottom: 1px solid color-mix(in srgb, var(--rule, #ddd) 55%, transparent);
}
.site-topbar .wordmark,
.site-topbar-blend .wordmark { font-weight: 650; text-decoration: none; letter-spacing: -0.02em; }
.site-topbar .nav,
.site-topbar-blend .nav { display: flex; flex-wrap: wrap; gap: 0.35rem 1.15rem; }
.site-topbar .nav a,
.site-topbar-blend .nav a {
  color: var(--muted); text-decoration: none; font-size: 0.9rem;
  padding: 0.35rem 0.15rem; border-bottom: 1px solid transparent;
}
.site-topbar .nav a:hover,
.site-topbar-blend .nav a:hover,
.site-topbar .nav a[aria-current="page"],
.site-topbar-blend .nav a[aria-current="page"] {
  color: var(--ink); border-bottom-color: color-mix(in srgb, var(--accent) 55%, transparent);
}
/* Pro templates: topic photograph as a full-page backdrop when a hero image exists */
body[data-chrome="topbar"] {
  min-height: 100svh;
  min-height: 100dvh;
  background-attachment: fixed;
}
body[data-chrome="topbar"] .hero.full-bleed-photo,
body[data-chrome="topbar"][data-layout="full-bleed"] .hero {
  min-height: 100svh;
  min-height: 100dvh;
  display: flex; flex-direction: column; justify-content: safe center;
}
body[data-chrome="topbar"] .section {
  background: color-mix(in srgb, var(--panel, #fff) 88%, transparent);
  backdrop-filter: blur(6px);
  border-radius: 0.85rem;
  margin: 1rem 1.5rem;
  padding: 2rem 1.5rem;
}
body[data-chrome="topbar"] .hero-frame,
body[data-chrome="topbar"] .hero-photo {
  overflow: hidden;
}
body[data-chrome="topbar"] .hero-photo {
  transition: transform .55s cubic-bezier(.22,.61,.36,1);
  transform: scale(1.001);
}
body[data-chrome="topbar"] .hero:hover .hero-photo {
  transform: scale(1.06);
}
body[data-chrome="topbar"] .card {
  transition: transform .28s cubic-bezier(.22,.61,.36,1), box-shadow .28s ease;
}
body[data-chrome="topbar"] .card:hover {
  transform: translateY(-5px);
  box-shadow: 0 16px 36px -10px color-mix(in srgb, var(--ink, #000) 14%, transparent);
}
@media (max-width: 48rem) {
  body[data-chrome="topbar"] {
    background-attachment: scroll;
  }
  body[data-chrome="topbar"] .hero.full-bleed-photo,
  body[data-chrome="topbar"][data-layout="full-bleed"] .hero {
    min-height: 100svh;
    padding-inline: 1.15rem;
  }
  body[data-chrome="topbar"] .section {
    margin: 0.75rem 1rem;
    padding: 1.5rem 1.15rem;
  }
  .site-topbar,
  .site-topbar-blend {
    padding-inline: 1rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  body[data-chrome="topbar"] .hero-photo,
  body[data-chrome="topbar"] .card {
    transition: none !important;
    transform: none !important;
  }
}
`;
    }

    return `
.site-liquid {
  --liquid-bg: #05070a;
  --liquid-ink: #f4f7fb;
  --liquid-muted: #a8b4c4;
  --liquid-gold: #d4b56a;
  --bloom-blue: #00a3ff;
  --bloom-amber: #f0a04a;
  --bloom-sky: #5ec8ff;
  color: var(--liquid-ink);
  background:
    radial-gradient(ellipse at 14% 8%, color-mix(in srgb, var(--bloom-blue) 28%, transparent), transparent 46%),
    radial-gradient(ellipse at 88% 14%, color-mix(in srgb, var(--bloom-sky) 18%, transparent), transparent 42%),
    radial-gradient(ellipse at 78% 92%, color-mix(in srgb, var(--bloom-amber) 14%, transparent), transparent 44%),
    linear-gradient(180deg, #0b121e 0%, var(--liquid-bg) 42%, var(--liquid-bg) 100%);
  min-height: 100dvh;
}
.site-liquid-bar {
  position: sticky; top: 0; z-index: 10;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 0.75rem 1.5rem; padding: 1rem 6vw;
  background: color-mix(in srgb, var(--liquid-bg) 55%, transparent);
  backdrop-filter: blur(18px) saturate(1.2);
  border-bottom: 1px solid color-mix(in srgb, var(--bloom-sky) 22%, transparent);
}
.site-liquid-bar .wordmark {
  font-family: Outfit, ui-sans-serif, system-ui, sans-serif;
  font-weight: 700; letter-spacing: -0.03em; text-decoration: none; color: var(--liquid-ink);
}
.site-liquid-bar .nav { display: flex; flex-wrap: wrap; gap: 0.35rem 1.25rem; }
.site-liquid-bar .nav a {
  color: color-mix(in srgb, var(--liquid-ink) 72%, transparent);
  text-decoration: none; font-size: 0.9rem;
}
.site-liquid-bar .nav a:hover,
.site-liquid-bar .nav a[aria-current="page"] { color: var(--liquid-gold); }
.liquid-deck {
  display: flex; flex-direction: column; gap: 0;
}
.liquid-slide {
  min-height: 100svh;
  min-height: 100dvh;
  height: auto;
  display: flex; flex-direction: column; justify-content: safe center;
  padding: 4.5rem 6vw;
  padding-top: max(4.5rem, calc(env(safe-area-inset-top, 0px) + 3.75rem));
  padding-bottom: max(2.25rem, env(safe-area-inset-bottom, 0px));
  border-bottom: 1px solid color-mix(in srgb, var(--bloom-sky) 14%, transparent);
  scroll-snap-align: start;
  scroll-snap-stop: normal;
  box-sizing: border-box;
}
/* Continuous scroll like pagecrafts.in — proximity snap, not hard page locks. */
html:has(.site-liquid) {
  scroll-behavior: smooth;
  scroll-snap-type: y proximity;
}
.site-liquid { overflow-x: clip; }
.site-liquid h1, .site-liquid h2 {
  font-family: Outfit, ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.03em;
}
.site-liquid .cta,
.site-liquid a.cta {
  border-radius: 999px; border: 1px solid var(--liquid-gold);
  background: var(--liquid-gold); color: #05070a; font-weight: 650;
}
@media (max-width: 48rem) {
  .liquid-slide {
    min-height: 100svh;
    padding-inline: 1.15rem;
    padding-top: max(4.75rem, calc(env(safe-area-inset-top, 0px) + 3.75rem));
    padding-bottom: max(2rem, env(safe-area-inset-bottom, 0px));
  }
  .liquid-slide:has(.cards),
  .liquid-slide:has(.contact-grid),
  .liquid-slide:has(.form) {
    justify-content: flex-start;
    padding-top: max(5.25rem, calc(env(safe-area-inset-top, 0px) + 4.25rem));
  }
  .site-liquid h1 {
    font-size: clamp(1.85rem, 9vw, 2.75rem);
  }
}
@media (prefers-reduced-motion: reduce) {
  html:has(.site-liquid) { scroll-behavior: auto; scroll-snap-type: none; }
}
`;
}
