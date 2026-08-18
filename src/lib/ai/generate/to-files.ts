import type { Composition, FileMap, SectionInstance, SectionKey } from '@/lib/contracts';
import { compositionShell } from '@/lib/render/page-shell';
import { SITE_NAV_CSS } from '@/lib/render/site-chrome';
import { appendFileSync } from 'node:fs';
import { contractFor } from '../sections/contracts';
import { sectionContentKey } from './schema';
import type { StyleId } from './styles';

/**
 * Turn a generated composition into a one-page site.
 *
 * This is not a gallery template: the words, sections and art direction come
 * from the job. Markup is HTML + CSS so the editor preview and publish path
 * already know how to show it. Image queries stay as slots — choosing a
 * photograph is a content edit, not something this renderer invents.
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
        return `<li class="card">${slot('h3', `${path}.${titleKey}`, escapeHtml(title))}${
            body ? slot('p', `${path}.${bodyKey}`, escapeHtml(body)) : ''
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
): string {
    const p = section.props;
    const key = sectionContentKey(section, visible);
    const heading = asString(p.heading);
    const anchor = sectionAnchor(section, visible);
    const open = `<section id="${escapeHtml(anchor)}" data-section-id="${escapeHtml(section.id)}" data-type="${section.type}" data-variant="${escapeHtml(section.variant)}" data-animate style="--i:${index}">`;
    return `${open}${renderInner(section.type, key, p, heading, visible)}</section>`;
}

function contactHref(visible: readonly SectionInstance[]): string {
    const contact = visible.find((s) => s.type === 'contact');
    return contact ? `#${sectionAnchor(contact, visible)}` : '#top';
}

function renderInner(
    type: SectionKey,
    key: string,
    p: Record<string, unknown>,
    heading: string,
    visible: readonly SectionInstance[],
): string {
    const h = (tag: 'h1' | 'h2', text: string) =>
        text ? slot(tag, `${key}.heading`, escapeHtml(text)) : '';

    // #region agent log
    appendFileSync('/opt/cursor/logs/debug.log', `${JSON.stringify({ hypothesisId: 'A,D', location: 'src/lib/ai/generate/to-files.ts:renderInner', message: 'render section branch', data: { type, key, hasHeading: Boolean(heading) }, timestamp: Date.now() })}\n`);
    // #endregion

    switch (type) {
        case 'hero':
            return [
                '<div class="hero-copy">',
                asString(p.eyebrow) ? slot('p', `${key}.eyebrow`, escapeHtml(asString(p.eyebrow)), ' class="eyebrow"') : '',
                h('h1', asString(p.heading)),
                asString(p.sub) ? slot('p', `${key}.sub`, escapeHtml(asString(p.sub)), ' class="lede"') : '',
                asString(p.ctaLabel)
                    ? slot('a', `${key}.ctaLabel`, escapeHtml(asString(p.ctaLabel)), ` class="cta" href="${contactHref(visible)}"`)
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
                return `<figure><div class="img-slot" role="img" aria-label="${escapeHtml(caption || 'Gallery')}" data-query="${escapeHtml(query)}">${photo}</div>${
                    query ? slot('span', `${path}.query`, escapeHtml(query), ' hidden') : ''
                }${
                    caption ? slot('figcaption', `${path}.alt`, escapeHtml(caption)) : ''
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
                return `<blockquote>${slot('p', `${path}.quote`, escapeHtml(asString(item.quote)))}${
                    asString(item.author) ? slot('cite', `${path}.author`, escapeHtml(asString(item.author))) : ''
                }</blockquote>`;
            }).join('')}`;
        case 'faq':
            return `${h('h2', heading)}${asList(p.items).map((item, index) => {
                const path = `${key}.items.${index}`;
                return `<details class="faq-item">${slot('summary', `${path}.question`, escapeHtml(asString(item.question)))}${
                    slot('p', `${path}.answer`, escapeHtml(asString(item.answer)))
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
                `<form class="form" action="" method="post">
        <input type="text" name="name" placeholder="Your name" aria-label="Name" autocomplete="name" />
        <input type="email" name="email" placeholder="you@example.com" aria-label="Email" autocomplete="email" required />
        <textarea name="message" rows="4" placeholder="How can we help?" aria-label="Message"></textarea>
        <button type="submit">${escapeHtml(send)}</button>
      </form>`,
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

// One class name with lib/render/site-chrome.ts, which is the nav the other renderer uses.
//
// There are two renderers turning a Composition into a page — this one, behind the editor
// preview and the site sync, and composition-html.ts. site-chrome.ts was extracted as the
// shared nav and only ever wired into the second, so this kept its own copy under a
// different class. Three tests written against the shared chrome sat red for two days
// because the code they exercise had never been migrated.
//
// The markup and the CSS are shared now. The *anchors* are not, deliberately: this renderer
// gives a section a readable id where its type is unique, so a published site has
// `#contact` in the address bar rather than `#s_04`, and its own test pins that. Sharing
// the anchor scheme too would mean choosing between the two, which is a product decision
// about customer-visible URLs and belongs to whoever owns the editor.
function siteNav(visible: readonly SectionInstance[], title: string): string {
    const links = visible
        .filter((s) => s.type !== 'hero' && s.type !== 'footer')
        .map((s) => {
            const label = contractFor(s.type).label;
            const href = `#${sectionAnchor(s, visible)}`;
            return `<a href="${href}">${escapeHtml(label)}</a>`;
        })
        .join('');

    return `<header class="site-nav">
  <a class="wordmark" href="#top">${escapeHtml(title)}</a>
  <nav aria-label="Site">${links}</nav>
</header>`;
}

const PAGE_CSS = `
${SITE_NAV_CSS}
.site-nav { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: var(--border-width) solid var(--rule); }
body { margin: 0; color: var(--ink); background: var(--bg); }
a { color: inherit; }
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
.cta:hover, .cta:focus { filter: brightness(1.08); }
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
address { font-style: normal; }
.contact-grid { display: grid; gap: var(--stack-gap, 1rem); margin-top: 1.5rem; }
@media (min-width: 720px) { .contact-grid { grid-template-columns: 1fr 1fr; } }
.form { display: grid; gap: 0.75rem; }
.form input, .form textarea {
  box-sizing: border-box; width: 100%; padding: 0.75rem 1rem;
  border: var(--border-width, 1px) solid var(--rule); border-radius: var(--radius-md);
  background: var(--panel); color: var(--ink); font: inherit;
}
.form button {
  justify-self: start; padding: 0.75rem 1.4rem; border: 0; border-radius: var(--radius-md);
  background: var(--accent); color: var(--accent-ink); font: inherit; font-weight: 600; cursor: pointer;
}
[data-type="footer"] { color: var(--muted); font-size: 0.9rem; padding-block: 2rem; }

[data-style="casual"] [data-type="hero"] { grid-template-columns: 1fr; }
[data-style="casual"] [data-type="hero"] .img-slot { display: none; }
[data-style="casual"] [data-type="hero"] { text-align: center; }
[data-style="casual"] [data-type="hero"] .lede { margin-inline: auto; }
[data-style="casual"] [data-type="about"] .img-slot { display: none; }

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

[data-style="motion"] [data-type="hero"] {
  animation: pc-rise 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
[data-style="motion"] .cta {
  animation: pc-pulse 2.2s ease-in-out infinite;
}
[data-style="motion"] .card {
  transition: transform 200ms ease, box-shadow 200ms ease;
}
[data-style="motion"] .card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--accent) 22%, transparent);
}
@keyframes pc-rise {
  from { opacity: 0; transform: translateY(28px) scale(0.96); }
  to { opacity: 1; transform: none; }
}
@keyframes pc-pulse {
  50% { filter: brightness(1.12); transform: translateY(-1px); }
}
@media (prefers-reduced-motion: reduce) {
  [data-style="motion"] [data-type="hero"],
  [data-style="motion"] .cta { animation: none; }
}
`;

/** A generated site as the file tree persistence already stores. */
export function compositionToFiles(composition: Composition, style?: StyleId): FileMap {
    const visible = composition.sections.filter((s) => s.visible);
    const title = composition.meta.title || 'Home';
    const styleAttr = style ? ` data-style="${escapeHtml(style)}"` : '';

    // #region agent log
    appendFileSync('/opt/cursor/logs/debug.log', `${JSON.stringify({ hypothesisId: 'A,B,C,D', location: 'src/lib/ai/generate/to-files.ts:compositionToFiles', message: 'renderer entry', data: { sectionCount: composition.sections.length, visibleCount: visible.length, types: visible.map((section) => section.type), style: style ?? null }, timestamp: Date.now() })}\n`);
    // #endregion

    const body = [
        `<style>${PAGE_CSS}</style>`,
        `<div class="site"${styleAttr}>`,
        siteNav(visible, title),
        `<main id="top">`,
        visible.map((section, index) => renderSection(section, index, visible)).join('\n'),
        `</main>`,
        `</div>`,
    ].join('\n');

    const files = {
        'index.html': compositionShell({
            title: composition.meta.title,
            description: composition.meta.description,
            lang: composition.meta.lang,
            artDirection: composition.artDirection,
            body,
        }),
    };

    // #region agent log
    appendFileSync('/opt/cursor/logs/debug.log', `${JSON.stringify({ hypothesisId: 'B,C,D', location: 'src/lib/ai/generate/to-files.ts:compositionToFiles', message: 'renderer exit', data: { htmlLength: files['index.html'].length, hasNav: files['index.html'].includes('class="site-nav"'), hasForm: files['index.html'].includes('class="form"'), hrefs: [...files['index.html'].matchAll(/href="#([^"]+)"/g)].map((match) => match[1]) }, timestamp: Date.now() })}\n`);
    // #endregion

    return files;
}
