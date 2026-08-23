import type { Composition, FileMap, SectionInstance, SectionKey } from '@/lib/contracts';
import { compositionShell } from '@/lib/render/page-shell';
import { sectionContentKey } from './schema';
import type { StyleId } from './styles';
import { motionMotifMarkup, motionStageMarkup, motionTickerMarkup } from './motion-motif';
import { interactionKit } from './interaction';
import {
    pageHref,
    planSitePages,
    settingsPageHtml,
    syntheticAboutHtml,
    syntheticContactHtml,
    workingForm,
    type SitePage,
} from './pages';

/**
 * D15 — turn a composition into a file tree the rest of the product already
 * knows how to save.
 *
 * A generation that never becomes a file is not a site. Every visible section
 * is a page of the site (linked from the header), with `data-slot` attributes
 * so the content panel can edit the words the model just wrote.
 *
 * Images stay as search queries, not Unsplash URLs — picking a photograph is
 * an editor action (and needs an id we do not have at generation time).
 */

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function asList(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
        ? value.filter((item): item is Record<string, unknown> =>
            !!item && typeof item === 'object' && !Array.isArray(item))
        : [];
}

function slot(tag: string, path: string, inner: string, extra = ''): string {
    return `<${tag} data-slot="${escapeHtml(path)}"${extra}>${inner}</${tag}>`;
}

function imageSlot(path: string, value: unknown, fallbackAlt: string): string {
    const rec = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
    const query = rec ? asString(rec.query) : (typeof value === 'string' ? value : '');
    const alt = (rec ? asString(rec.alt) : '') || fallbackAlt;
    const url = rec ? asString(rec.url) : '';
    const photo = url
        ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`
        : '';
    return `<div class="img-slot" data-slot="${escapeHtml(path)}" role="img" aria-label="${escapeHtml(alt)}" data-query="${escapeHtml(query)}">${photo}</div>`;
}

function listMarkup(
    sectionKey: string,
    fieldKey: string,
    items: Record<string, unknown>[],
    titleKey: string,
    bodyKey: string,
    extra?: (item: Record<string, unknown>, path: string) => string,
): string {
    if (items.length === 0) return '';
    return `<ul class="cards">${items.map((item, index) => {
        const path = `${sectionKey}.${fieldKey}.${index}`;
        const title = asString(item[titleKey]);
        const body = asString(item[bodyKey]);
        const more = extra?.(item, path) ?? '';
        return `<li class="card">${slot('h3', `${path}.${titleKey}`, escapeHtml(title))}${body ? slot('p', `${path}.${bodyKey}`, escapeHtml(body)) : ''
            }${more}</li>`;
    }).join('')}</ul>`;
}

function sectionAnchor(
    section: SectionInstance,
    visible: readonly SectionInstance[],
): string {
    const unique = visible.filter((s) => s.type === section.type).length === 1;
    return unique ? section.type : section.id;
}

function renderSection(
    section: SectionInstance,
    index: number,
    visible: readonly SectionInstance[],
    motifHtml: string,
): string {
    const p = section.props;
    const key = sectionContentKey(section, visible);
    const heading = asString(p.heading);
    const anchor = sectionAnchor(section, visible);
    const open = `<section id="${escapeHtml(anchor)}" data-section-id="${escapeHtml(section.id)}" data-type="${section.type}" data-variant="${escapeHtml(section.variant)}" data-animate style="--i:${index}">`;
    const motif = section.type === 'hero' ? motifHtml : '';
    return `${open}${motif}${renderInner(section.type, key, p, heading)}</section>`;
}

function contactHref(): string {
    return 'contact.html';
}

function renderInner(
    type: SectionKey,
    key: string,
    p: Record<string, unknown>,
    heading: string,
): string {
    const h = (tag: 'h1' | 'h2', text: string) =>
        text ? slot(tag, `${key}.heading`, escapeHtml(text)) : '';

    switch (type) {
        case 'hero':
            return [
                '<div class="hero-copy">',
                asString(p.eyebrow) ? slot('p', `${key}.eyebrow`, escapeHtml(asString(p.eyebrow)), ' class="eyebrow"') : '',
                h('h1', asString(p.heading)),
                asString(p.sub) ? slot('p', `${key}.sub`, escapeHtml(asString(p.sub)), ' class="lede"') : '',
                asString(p.ctaLabel)
                    ? slot('a', `${key}.ctaLabel`, escapeHtml(asString(p.ctaLabel)), ` class="cta" href="${contactHref()}"`)
                    : '',
                '</div>',
                imageSlot(`${key}.image`, p.image, asString(p.heading) || 'Hero'),
            ].join('');
        case 'about':
            return `${h('h2', heading)}${asString(p.body) ? slot('p', `${key}.body`, escapeHtml(asString(p.body))) : ''}${imageSlot(`${key}.image`, p.image, heading || 'About')}`;
        case 'services':
            return `${h('h2', heading)}${listMarkup(key, 'items', asList(p.items), 'title', 'body')}`;
        case 'menu':
            return `${h('h2', heading)}${listMarkup(key, 'items', asList(p.items), 'name', 'description', (item, path) =>
                asString(item.price) ? slot('span', `${path}.price`, escapeHtml(asString(item.price)), ' class="price"') : '')}`;
        case 'gallery': {
            const images = asList(p.images);
            const figures = images.map((img, index) => {
                const path = `${key}.images.${index}`;
                const caption = asString(img.alt) || asString(img.query);
                const query = asString(img.query);
                const photo = asString(img.url)
                    ? `<img src="${escapeHtml(asString(img.url))}" alt="${escapeHtml(caption || 'Gallery')}" loading="lazy" decoding="async" />`
                    : '';
                return `<figure><div class="img-slot" role="img" aria-label="${escapeHtml(caption || 'Gallery')}" data-query="${escapeHtml(query)}">${photo}</div>${query ? slot('span', `${path}.query`, escapeHtml(query), ' hidden') : ''
                    }${caption ? slot('figcaption', `${path}.alt`, escapeHtml(caption)) : ''
                    }</figure>`;
            }).join('');
            return `${h('h2', heading)}<div class="gallery">${figures}</div>`;
        }
        case 'team':
            return `${h('h2', heading)}${listMarkup(key, 'members', asList(p.members), 'name', 'bio', (item, path) =>
                asString(item.role) ? slot('p', `${path}.role`, escapeHtml(asString(item.role)), ' class="role"') : '')}`;
        case 'testimonials':
            return `${h('h2', heading)}${asList(p.items).map((item, index) => {
                const path = `${key}.items.${index}`;
                return `<blockquote>${slot('p', `${path}.quote`, escapeHtml(asString(item.quote)))}${asString(item.author) ? slot('cite', `${path}.author`, escapeHtml(asString(item.author))) : ''
                    }</blockquote>`;
            }).join('')}`;
        case 'faq':
            return `${h('h2', heading)}${asList(p.items).map((item, index) => {
                const path = `${key}.items.${index}`;
                return `<details>${slot('summary', `${path}.question`, escapeHtml(asString(item.question)))}${slot('p', `${path}.answer`, escapeHtml(asString(item.answer)))
                    }</details>`;
            }).join('')}`;
        case 'contact': {
            const send = asString(p.ctaLabel) || 'Send';
            return [
                h('h2', heading),
                asString(p.blurb) ? slot('p', `${key}.blurb`, escapeHtml(asString(p.blurb))) : '',
                '<div class="contact-grid">',
                '<address>',
                asString(p.address) ? slot('p', `${key}.address`, escapeHtml(asString(p.address))) : '',
                asString(p.phone)
                    ? `<p><a href="tel:${escapeHtml(asString(p.phone))}">${slot('span', `${key}.phone`, escapeHtml(asString(p.phone)))}</a></p>`
                    : '',
                asString(p.email)
                    ? `<p><a href="mailto:${escapeHtml(asString(p.email))}">${slot('span', `${key}.email`, escapeHtml(asString(p.email)))}</a></p>`
                    : '',
                asString(p.hours) ? slot('p', `${key}.hours`, escapeHtml(asString(p.hours))) : '',
                '</address>',
                workingForm(
                    asString(p.email) ? `mailto:${asString(p.email)}` : '#',
                    `<input type="text" name="name" placeholder="Your name" aria-label="Name" autocomplete="name" required />
        <input type="email" name="email" placeholder="you@example.com" aria-label="Email" autocomplete="email" required />
        <textarea name="message" rows="4" placeholder="How can we help?" aria-label="Message" required></textarea>`,
                    send,
                ),
                '</div>',
            ].join('');
        }
        case 'footer':
            return slot('p', `${key}.tagline`, escapeHtml(asString(p.tagline)));
        default: {
            const exhaustive: never = type;
            return exhaustive;
        }
    }
}

// `site-header`, not `site-nav`.
//
// There are two renderers turning a Composition into a page — this one, behind the editor
// preview and the site sync, and composition-html.ts, which uses the shared site-chrome.ts
// and its `site-nav`. I renamed this one to match in #168, on the strength of three tests
// that asked for `site-nav`. The editor track then asserted the opposite on 2026-08-19,
// in a commit called "assert site-header on generated pages", which is a clearer statement
// of intent than the tests were. Their renderer, their call — this follows it, and all
// three tests agree on it now.
function siteNav(pages: readonly SitePage[], current: string, title: string): string {
    const links = pages
        .map((page) => {
            const href = pageHref(page.path, current);
            const currentAttr = page.path === current ? ' aria-current="page"' : '';
            return `<a href="${escapeHtml(href)}"${currentAttr}>${escapeHtml(page.label)}</a>`;
        })
        .join('');

    return `<header class="site-header">
  <a class="wordmark" href="${escapeHtml(pageHref('index.html', current))}">${escapeHtml(title)}</a>
  <nav aria-label="Site">${links}</nav>
</header>`;
}

const PAGE_CSS = `
body { margin: 0; color: var(--ink); background: var(--bg); }
a { color: inherit; }
.site-header {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 0.75rem 1.5rem; max-width: 72rem; margin: 0 auto; padding: 1.25rem 1.5rem;
}
.wordmark { font-weight: 700; text-decoration: none; letter-spacing: var(--display-tracking, -0.01em); }
.site-header nav { display: flex; flex-wrap: wrap; gap: 0.35rem 1.1rem; }
.site-header nav a {
  color: var(--muted); text-decoration: none; font-size: 0.95rem; cursor: pointer;
}
.site-header nav a:hover { color: var(--ink); }
main { max-width: 72rem; margin: 0 auto; padding-inline: 1.5rem; padding-bottom: 3rem; }
section { padding-block: var(--section-gap, 3.5rem); }
[data-type="hero"] {
  display: grid; gap: 1.5rem; align-items: center;
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 768px) {
  [data-type="hero"] { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); }
}
.hero-copy { min-width: 0; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.75rem; color: var(--muted); margin: 0 0 0.5rem; }
.lede { font-size: 1.1rem; line-height: 1.6; color: var(--muted); max-width: 40rem; }
.cta {
  display: inline-block; margin-top: 1rem; padding: 0.75rem 1.25rem;
  background: var(--accent); color: var(--accent-ink);
  border-radius: var(--radius-md); text-decoration: none; font-weight: 600;
  cursor: pointer;
}
.img-slot {
  min-height: 12rem; background: var(--panel); border: var(--border-width, 1px) solid var(--rule);
  border-radius: var(--radius-md); overflow: hidden;
}
.img-slot img { display: block; width: 100%; height: 100%; min-height: 12rem; object-fit: cover; }
.cards {
  list-style: none; padding: 0; margin: 1.25rem 0 0;
  display: grid; gap: var(--stack-gap, 1rem);
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
}
.card {
  background: var(--panel); border: 1px solid var(--rule);
  border-radius: var(--radius-md); padding: 1.1rem 1.2rem;
}
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: var(--stack-gap, 1rem); }
.gallery figure { margin: 0; }
.price { color: var(--muted); margin-left: 0.5rem; }
.role { color: var(--muted); margin: 0.2rem 0 0; }
blockquote { margin: 0 0 var(--stack-gap, 1rem); padding-left: 1rem; border-left: 3px solid var(--accent); }
cite { display: block; color: var(--muted); font-style: normal; margin-top: 0.4rem; }
details { border-bottom: 1px solid var(--rule); padding: 0.75rem 0; cursor: pointer; }
.contact-grid { display: grid; gap: var(--stack-gap, 1rem); margin-top: 1.5rem; }
@media (min-width: 720px) { .contact-grid { grid-template-columns: 1fr 1fr; } }
address { font-style: normal; }
.form { display: grid; gap: 0.75rem; }
.form input, .form textarea {
  width: 100%; padding: 0.75rem 1rem; border: var(--border-width, 1px) solid var(--rule);
  border-radius: var(--radius-md); background: var(--panel); color: var(--ink); font: inherit;
}
.form button {
  justify-self: start; padding: 0.75rem 1.25rem; border: 0; border-radius: var(--radius-md);
  background: var(--accent); color: var(--accent-ink); font: inherit; font-weight: 600; cursor: pointer;
}
[data-type="footer"] { color: var(--muted); font-size: 0.9rem; padding-block: 2rem; }
.settings-list { display: grid; gap: 0.35rem 1rem; margin: 1.25rem 0 2rem; }
.settings-list dt { color: var(--muted); font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; }
.settings-list dd { margin: 0 0 0.75rem; }
.form-status { margin: 0; color: var(--muted); }

/* Casual keeps one hero photograph (split beside the copy) and hides the rest —
   Photo-rich is the look that paints pictures through about/gallery. */
[data-style="casual"] [data-type="hero"] {
  gap: 2rem;
  padding: 1.25rem;
  background: color-mix(in srgb, var(--accent) 10%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--rule));
  border-radius: var(--radius-lg, 1rem);
}
[data-style="casual"] [data-type="hero"] .img-slot {
  min-height: 14rem;
  border: 0;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--ink) 12%, transparent);
}
[data-style="casual"] [data-type="about"] .img-slot,
[data-style="casual"] [data-type="services"] .img-slot,
[data-style="casual"] [data-type="gallery"] .img-slot { display: none; }

[data-variant="image-bg"] {
  display: grid !important;
  grid-template-columns: 1fr !important;
  min-height: 28rem;
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  padding-block: 0;
}
[data-variant="image-bg"] .hero-copy,
[data-variant="image-bg"] .img-slot { grid-area: 1 / 1; }
[data-variant="image-bg"] .img-slot {
  min-height: 28rem; height: 100%; border: 0; border-radius: 0;
}
[data-variant="image-bg"] .img-slot img {
  width: 100%; height: 100%; min-height: 28rem; object-fit: cover; border-radius: 0;
}
[data-variant="image-bg"] .hero-copy {
  z-index: 1; align-self: end; color: #fff;
  background: linear-gradient(transparent, rgba(12, 10, 9, 0.72));
  padding: 4rem 1.5rem 2.25rem; max-width: none;
}
[data-variant="image-bg"] .eyebrow,
[data-variant="image-bg"] .lede { color: rgba(255,255,255,0.88); }

[data-variant="media-split"] {
  display: grid; gap: 2rem; align-items: center;
}
@media (min-width: 768px) {
  [data-variant="media-split"] { grid-template-columns: 1fr 1fr; }
}
[data-variant="media-split"] .img-slot img {
  width: 100%; height: 100%; object-fit: cover; min-height: 16rem;
}
`;

/** Premium look only — kinetic canvas CSS must not leak into Casual/Photo-rich HTML. */
const MOTION_CSS = `
body:has([data-style="motion"]) {
  --bg: #06040c;
  --ink: #f6f3ff;
  --muted: #b7b0cc;
  --accent: #ff2d6a;
  --accent-ink: #ffffff;
  --panel: rgba(255, 255, 255, 0.055);
  --rule: rgba(255, 255, 255, 0.12);
  --display-tracking: -0.06em;
  background: #06040c;
  color: #f6f3ff;
}
[data-style="motion"] .site-header {
  position: sticky;
  top: 0;
  z-index: 8;
  max-width: none;
  padding-inline: 6vw;
  background: color-mix(in srgb, #06040c 62%, transparent);
  backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
[data-style="motion"] .site-header nav a { color: rgba(246, 243, 255, 0.72); }
[data-style="motion"] .site-header nav a:hover { color: #fff; }
[data-style="motion"] main {
  max-width: none;
  padding-inline: 0;
  padding-bottom: 0;
  counter-reset: pc-sec;
}
[data-style="motion"] [data-type="hero"] {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr;
  place-items: center;
  text-align: center;
  min-height: 92vh;
  padding: 7rem 6vw 8.5rem;
}
[data-style="motion"] [data-type="hero"] .img-slot {
  display: block;
  position: absolute;
  inset: 0;
  z-index: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  min-height: 0;
  overflow: hidden;
  opacity: 0.72;
  animation: pc-kenburns 26s ease-in-out infinite alternate;
  will-change: transform;
}
[data-style="motion"] [data-type="hero"] .img-slot img {
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: cover;
}
[data-style="motion"] [data-type="hero"]::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    rgba(8, 5, 16, 0.5) 0%,
    rgba(8, 5, 16, 0.18) 38%,
    rgba(8, 5, 16, 0.82) 100%
  );
}
[data-style="motion"] [data-type="hero"] .hero-copy {
  position: relative;
  z-index: 3;
  max-width: min(52rem, 88vw);
}
[data-style="motion"] [data-type="hero"] .lede {
  margin-inline: auto;
  max-width: 46ch;
  font-size: clamp(1.05rem, 1.5vw, 1.35rem);
  line-height: 1.6;
  color: rgba(250, 248, 255, 0.92);
  text-shadow: 0 1px 14px rgba(8, 5, 16, 0.7);
}
[data-style="motion"] [data-type="hero"] h1 {
  font-size: clamp(2.4rem, 8.2vw, 6.6rem);
  font-weight: 800;
  letter-spacing: -0.055em;
  line-height: 0.94;
  margin: 0 auto 0.7em;
  max-width: min(16ch, 100%);
  overflow-wrap: break-word;
  text-wrap: balance;
  background: linear-gradient(115deg, #fff 8%, #fff 32%, var(--accent) 52%, #fbbf24 74%, #fff 100%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: pc-type 9s ease-in-out infinite;
  filter: drop-shadow(0 2px 18px rgba(8, 5, 16, 0.75));
}
@keyframes pc-kenburns {
  from { transform: scale(1.05) translate3d(0, 0, 0); }
  to { transform: scale(1.17) translate3d(0, -2%, 0); }
}
[data-style="motion"] .eyebrow {
  display: inline-flex;
  margin-bottom: 1.1rem;
  padding: 0.38rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: #ffd0dc;
  letter-spacing: 0.22em;
  font-size: 0.68rem;
}
[data-style="motion"] .motion-stage {
  position: absolute;
  inset: -12%;
  z-index: 0;
  pointer-events: none;
}
[data-style="motion"] .motion-aurora {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 52% 42% at 16% 28%, color-mix(in srgb, var(--accent) 58%, transparent), transparent 62%),
    radial-gradient(ellipse 46% 36% at 86% 12%, rgba(124, 58, 237, 0.55), transparent 64%),
    radial-gradient(ellipse 42% 38% at 72% 86%, rgba(245, 158, 11, 0.34), transparent 62%);
  filter: blur(30px);
  animation: pc-aurora 16s ease-in-out infinite alternate;
}
[data-style="motion"] .motion-grid {
  position: absolute;
  inset: 18% -10% -30%;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: radial-gradient(ellipse at 50% 0%, #000 12%, transparent 72%);
  transform: perspective(700px) rotateX(62deg);
  transform-origin: 50% 0;
  animation: pc-grid 22s linear infinite;
}
[data-style="motion"] .motion-grain {
  position: absolute;
  inset: -20%;
  opacity: 0.2;
  mix-blend-mode: overlay;
  background-image:
    repeating-radial-gradient(circle at 18% 22%, rgba(255,255,255,0.22) 0 1px, transparent 1px 3px),
    repeating-radial-gradient(circle at 82% 78%, rgba(255,255,255,0.16) 0 1px, transparent 1px 4px);
  animation: pc-grain 0.38s steps(3) infinite;
}
[data-style="motion"] .motion-flare {
  position: absolute;
  width: 130vmax;
  height: 130vmax;
  left: 50%;
  top: 38%;
  translate: -50% -50%;
  background: conic-gradient(from 200deg, transparent 0 58%, color-mix(in srgb, var(--accent) 20%, transparent) 70%, transparent 86%);
  animation: pc-flare 24s linear infinite;
  opacity: 0.65;
}
[data-style="motion"] .motion-motif {
  position: absolute;
  inset: 0;
  z-index: 1;
  color: var(--accent);
  pointer-events: none;
}
[data-style="motion"] .motif-halo {
  position: absolute;
  right: 4%;
  top: 12%;
  width: min(46vw, 420px);
  height: min(46vw, 420px);
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  box-shadow: 0 0 80px color-mix(in srgb, var(--accent) 28%, transparent);
  animation: pc-halo 12s linear infinite;
}
[data-style="motion"] .motion-motif svg {
  position: absolute;
  right: 4%;
  top: 10%;
  width: min(26vw, 260px);
  height: auto;
  display: block;
  filter: drop-shadow(0 0 36px color-mix(in srgb, var(--accent) 45%, transparent));
}
[data-style="motion"] .motion-motif svg.motif-ghost {
  right: -4%;
  top: 2%;
  width: min(62vw, 640px);
  opacity: 0.18;
  filter: blur(10px);
  animation: pc-spin 28s linear infinite reverse;
}
[data-style="motion"] .motion-motif[data-motif="jalebi"] svg.motif-body {
  animation: pc-spin 18s linear infinite;
  color: #f59e0b;
}
[data-style="motion"] .motion-motif[data-motif="jalebi"] svg.motif-ghost {
  color: #f59e0b;
}
[data-style="motion"] .jalebi-coil {
  stroke-dasharray: 280;
  animation: pc-draw 3.6s ease-in-out infinite alternate;
}
[data-style="motion"] .honey-drip {
  position: absolute;
  left: 72%;
  top: 52%;
  width: 16px;
  height: 28px;
  border-radius: 40% 40% 55% 55%;
  background: linear-gradient(#fbbf24, #b45309);
  box-shadow: 0 0 18px #f59e0b;
  animation: pc-drip 1.8s ease-in infinite;
  animation-delay: var(--d, 0s);
}
[data-style="motion"] .honey-drip-b { left: 78%; top: 44%; }
[data-style="motion"] .honey-drip-c { left: 66%; top: 58%; width: 11px; height: 18px; }
[data-style="motion"] .motif-spark {
  position: absolute;
  width: 11px;
  height: 11px;
  right: calc(18% + (var(--s, 0) * 7%));
  top: calc(22% + (var(--s, 0) * 11%));
  background: #fff;
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
  animation: pc-spark 1.9s ease-in-out infinite;
  animation-delay: calc(var(--s, 0) * 0.28s);
}
[data-style="motion"] .motion-motif[data-motif="tooth"] svg {
  animation: pc-float 4.6s ease-in-out infinite;
  color: #e8eef5;
}
[data-style="motion"] .motion-motif[data-motif="leaf"] svg,
[data-style="motion"] .motion-motif[data-motif="flame"] svg,
[data-style="motion"] .motion-motif[data-motif="flower"] svg,
[data-style="motion"] .motion-motif[data-motif="drape"] svg {
  animation: pc-sway 3.4s ease-in-out infinite;
  transform-origin: 70% 80%;
}
[data-style="motion"] .motion-motif[data-motif="heart"] svg,
[data-style="motion"] .motion-motif[data-motif="bolt"] svg {
  animation: pc-pulse 1.4s ease-in-out infinite;
}
[data-style="motion"] .motion-motif[data-motif="wheel"] svg {
  animation: pc-spin 8s linear infinite;
}
[data-style="motion"] .motion-motif[data-motif="steam"] svg {
  animation: pc-nudge 3.2s ease-in-out infinite;
}
[data-style="motion"] .motion-motif[data-motif="scale"] svg,
[data-style="motion"] .motion-motif[data-motif="note"] svg,
[data-style="motion"] .motion-motif[data-motif="paw"] svg,
[data-style="motion"] .motion-motif[data-motif="needle"] svg,
[data-style="motion"] .motion-motif[data-motif="building"] svg,
[data-style="motion"] .motion-motif[data-motif="crate"] svg,
[data-style="motion"] .motion-motif[data-motif="cap"] svg,
[data-style="motion"] .motion-motif[data-motif="coin"] svg {
  animation: pc-float 5s ease-in-out infinite;
}
[data-style="motion"] .motion-ticker {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 7%;
  z-index: 2;
  overflow: hidden;
  pointer-events: none;
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  font-size: clamp(2.4rem, 7vw, 5.4rem);
  font-weight: 800;
  letter-spacing: -0.06em;
  line-height: 1;
  white-space: nowrap;
  color: #fff;
  opacity: 0.1;
}
[data-style="motion"] .motion-ticker p {
  display: inline-block;
  max-width: none;
  margin: 0;
  animation: pc-marquee 22s linear infinite;
}
[data-style="motion"] .cta {
  position: relative;
  overflow: hidden;
  margin-top: 1.4rem;
  padding: 0.95rem 1.7rem;
  border-radius: 999px;
  animation: pc-pulse 1.4s ease-in-out infinite;
  box-shadow:
    0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent),
    0 16px 40px color-mix(in srgb, var(--accent) 38%, transparent);
}
[data-style="motion"] .cta::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.45), transparent 72%);
  transform: translateX(-130%);
  animation: pc-shine 2.8s ease-in-out infinite;
}
[data-style="motion"] section:not([data-type="hero"]):not([data-type="footer"]) {
  counter-increment: pc-sec;
  max-width: 72rem;
  margin-inline: auto;
  padding-inline: 6vw;
}
[data-style="motion"] section:not([data-type="hero"]):not([data-type="footer"]) h2::before {
  content: counter(pc-sec, decimal-leading-zero);
  display: block;
  margin-bottom: 0.45rem;
  color: var(--accent);
  font-size: 0.72rem;
  letter-spacing: 0.22em;
}
[data-style="motion"] [data-type="footer"] {
  padding-inline: 6vw;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
[data-style="motion"] .card {
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(16px);
  transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
}
[data-style="motion"] .card:hover {
  transform: translateY(-6px);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  box-shadow: 0 18px 40px color-mix(in srgb, var(--accent) 22%, transparent);
}
[data-style="motion"] .form input,
[data-style="motion"] .form textarea {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.14);
  color: #fff;
}
@keyframes pc-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes pc-draw {
  from { stroke-dashoffset: 220; }
  to { stroke-dashoffset: 0; }
}
@keyframes pc-drip {
  0% { transform: translateY(0); opacity: 0.95; }
  70% { transform: translateY(22px); opacity: 0.7; }
  100% { transform: translateY(36px); opacity: 0; }
}
@keyframes pc-sway {
  0%, 100% { transform: rotate(-7deg); }
  50% { transform: rotate(7deg); }
}
@keyframes pc-nudge {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-10px) rotate(4deg); }
}
@keyframes pc-float {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(-5deg); }
  50% { transform: translate3d(0, -18px, 0) rotate(4deg); }
}
@keyframes pc-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent), 0 16px 40px color-mix(in srgb, var(--accent) 38%, transparent); }
  50% { transform: scale(1.05); box-shadow: 0 0 0 14px transparent, 0 16px 40px color-mix(in srgb, var(--accent) 38%, transparent); }
}
@keyframes pc-aurora {
  from { transform: translate3d(-4%, -2%, 0) scale(1); }
  to { transform: translate3d(5%, 3%, 0) scale(1.08); }
}
@keyframes pc-grid {
  from { background-position: 0 0; }
  to { background-position: 72px 72px; }
}
@keyframes pc-grain {
  0%, 100% { transform: translate(0, 0); }
  33% { transform: translate(-1.2%, 0.8%); }
  66% { transform: translate(1%, -1%); }
}
@keyframes pc-flare {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes pc-halo {
  from { transform: rotate(0deg) scale(1); opacity: 0.7; }
  50% { transform: rotate(180deg) scale(1.06); opacity: 1; }
  to { transform: rotate(360deg) scale(1); opacity: 0.7; }
}
@keyframes pc-spark {
  0%, 100% { transform: scale(0.4) rotate(0deg); opacity: 0.35; }
  50% { transform: scale(1) rotate(18deg); opacity: 1; }
}
@keyframes pc-type {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
@keyframes pc-shine {
  0%, 55% { transform: translateX(-130%); }
  100% { transform: translateX(130%); }
}
@keyframes pc-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  [data-style="motion"] .motion-motif svg,
  [data-style="motion"] .honey-drip,
  [data-style="motion"] .motif-spark,
  [data-style="motion"] .motif-halo,
  [data-style="motion"] .motion-aurora,
  [data-style="motion"] .motion-grid,
  [data-style="motion"] .motion-grain,
  [data-style="motion"] .motion-flare,
  [data-style="motion"] .motion-ticker p,
  [data-style="motion"] [data-type="hero"] h1,
  [data-style="motion"] [data-type="hero"] .img-slot,
  [data-style="motion"] .cta,
  [data-style="motion"] .cta::after { animation: none; }
}
`;

function pageInner(
    page: SitePage,
    composition: Composition,
    visible: readonly SectionInstance[],
    motif: string,
): string {
    if (page.kind === 'settings') return settingsPageHtml(composition);
    if (page.kind === 'about' && page.sections.length === 0) return syntheticAboutHtml(composition);
    if (page.kind === 'contact' && page.sections.length === 0) return syntheticContactHtml(composition);
    return page.sections
        .map((section, index) => renderSection(section, index, visible, motif))
        .join('\n');
}

/** A generated site as the file tree persistence already stores. */
export function compositionToFiles(
    composition: Composition,
    style?: StyleId,
    seed = '',
): FileMap {
    // Premium only. interactionKit returns nothing for the other two looks, so a Free or Pro
    // page ships byte-identical to before.
    const interaction = style ? interactionKit(style, seed, composition.vertical) : [];
    const visible = composition.sections.filter((s) => s.visible);
    const pages = planSitePages(composition);
    const title = composition.meta.title || 'Home';
    const styleAttr = style ? ` data-style="${escapeHtml(style)}"` : '';
    const motif = style === 'motion'
        ? `${motionStageMarkup()}${motionMotifMarkup(composition.vertical, `${composition.meta.title} ${composition.meta.description}`)}${motionTickerMarkup(composition.meta.title)}`
        : '';
    const css = style === 'motion' ? `${PAGE_CSS}${MOTION_CSS}` : PAGE_CSS;
    const footers = visible.filter((s) => s.type === 'footer');
    const files: FileMap = {};

    for (const page of pages) {
        const body = [
            `<style>${css}</style>`,
            `<div class="site"${styleAttr}>`,
            siteNav(pages, page.path, title),
            `<main id="top">`,
            pageInner(page, composition, visible, motif),
            footers.map((section, index) => renderSection(section, index, visible, '')).join('\n'),
            `</main>`,
            `</div>`,
        ].join('\n');

        files[page.path] = compositionShell({
            title: composition.meta.title,
            description: composition.meta.description,
            lang: composition.meta.lang,
            artDirection: composition.artDirection,
            body,
            interaction,
        });
    }

    return files;
}
