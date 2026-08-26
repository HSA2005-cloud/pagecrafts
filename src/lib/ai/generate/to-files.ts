import type { Composition, FileMap, SectionInstance, SectionKey } from '@/lib/contracts';
import { compositionShell, lookFontLinks } from '@/lib/render/page-shell';
import { PREMIUM_CSS, PREMIUM_JS, TABS_CSS, TABS_JS } from '@/lib/render/tier-assets';
import { sectionContentKey } from './schema';
import type { StyleId } from './styles';
import { motionMotifMarkup, motionStageMarkup, motionTickerMarkup } from './motion-motif';
import { interactionKit } from './interaction';
import {
    finishedAboutBody,
    finishedContactFacts,
    finishedFooterTagline,
    pageHref,
    planSitePages,
    settingsPageHtml,
    syntheticAboutHtml,
    syntheticContactHtml,
    workingForm,
    type SitePage,
} from './pages';
import { chromeForStyleId } from '@/lib/sites/tier-chrome';
import { tierChromeCss } from '@/lib/sites/tier-chrome-markup';

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
    const url = rec ? (asString(rec.url) || asString(rec.src)) : '';
    // Eager: Pick-a-look cards use a short scaled iframe. `loading="lazy"` never
    // intersects that viewport, so heroes shipped as empty beige boxes with alt text.
    const photo = url
        ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="eager" decoding="async" fetchpriority="high" />`
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
    continuous = false,
    site?: { title: string; description: string; vertical: string },
): string {
    const p = section.props;
    const key = sectionContentKey(section, visible);
    const heading = asString(p.heading);
    const anchor = sectionAnchor(section, visible);
    const slideClass = continuous ? ' class="liquid-slide"' : '';
    const open = `<section id="${escapeHtml(anchor)}" data-section-id="${escapeHtml(section.id)}" data-type="${section.type}" data-variant="${escapeHtml(section.variant)}" data-animate${slideClass} style="--i:${index}">`;
    const motif = section.type === 'hero' ? motifHtml : '';
    return `${open}${motif}${renderInner(section.type, key, p, heading, section.variant, continuous, site)}</section>`;
}

/**
 * Services as tabs — the Pro tier's one interactive section.
 *
 * Menu and gallery would tab too, and were tried. Neither can: a menu item is a name, a
 * description and a price, and a gallery image is a query and an alt (see
 * src/lib/ai/sections/contracts.ts). Nothing says which course a dish is or what a photo is
 * of, so tabs there have to invent their categories — labelling the first third of the list
 * "Starters & Mains" states something about the food that the data does not support, and
 * splitting photos into "Featured" and "Highlights" repeats every image under a second
 * data-slot, which the content writer cannot update (slotPattern has no /g, so an edit lands
 * on the first copy and the second goes stale on the same page).
 *
 * Real category tabs need a category field on the section contract and a fill prompt that
 * populates it. That is the AI track's call. A service already carries its own title, so it
 * is the one list that can be tabbed honestly with the data we have.
 */
function tabbedItems(key: string, items: readonly Record<string, unknown>[]): string {
    const usable = items.filter((item) => asString(item.title));
    if (usable.length < 2) return '';

    const tabs = usable.map((item, index) =>
        `<button type="button" role="tab" id="${key}-t${index}" aria-controls="${key}-p${index}" aria-selected="${index === 0 ? 'true' : 'false'}" tabindex="${index === 0 ? '0' : '-1'}">${escapeHtml(asString(item.title))}</button>`,
    ).join('');

    const panels = usable.map((item, index) => {
        const path = `${key}.items.${index}`;
        return `<div role="tabpanel" id="${key}-p${index}" aria-labelledby="${key}-t${index}"${index === 0 ? '' : ' hidden'}>${slot('h3', `${path}.title`, escapeHtml(asString(item.title)))
            }${asString(item.body) ? slot('p', `${path}.body`, escapeHtml(asString(item.body))) : ''}</div>`;
    }).join('');

    return `<div class="tabs" data-tabs><div class="tablist" role="tablist">${tabs}</div><div class="tabpanels">${panels}</div></div>`;
}

function contactHref(continuous = false): string {
    return continuous ? '#contact' : 'contact.html';
}

function renderInner(
    type: SectionKey,
    key: string,
    p: Record<string, unknown>,
    heading: string,
    variant = '',
    continuous = false,
    site?: { title: string; description: string; vertical: string },
): string {
    const h = (tag: 'h1' | 'h2', text: string) =>
        text ? slot(tag, `${key}.heading`, escapeHtml(text)) : '';
    const siteTitle = site?.title?.trim() || '';

    switch (type) {
        case 'hero':
            return [
                '<div class="hero-copy">',
                asString(p.eyebrow) ? slot('p', `${key}.eyebrow`, escapeHtml(asString(p.eyebrow)), ' class="eyebrow"') : '',
                h('h1', asString(p.heading)),
                asString(p.sub) ? slot('p', `${key}.sub`, escapeHtml(asString(p.sub)), ' class="lede"') : '',
                asString(p.ctaLabel)
                    ? slot('a', `${key}.ctaLabel`, escapeHtml(asString(p.ctaLabel)), ` class="cta" href="${contactHref(continuous)}"`)
                    : '',
                '</div>',
                imageSlot(`${key}.image`, p.image, asString(p.heading) || 'Hero'),
            ].join('');
        case 'about': {
            const body = finishedAboutBody(p, {
                title: siteTitle,
                description: site?.description,
                vertical: site?.vertical,
            });
            const title = asString(p.heading) || (siteTitle ? `About ${siteTitle}` : 'About');
            return `${h('h2', title)}${slot('p', `${key}.body`, escapeHtml(body))}${imageSlot(`${key}.image`, p.image, title)}`;
        }
        case 'services': {
            if (variant === 'tabs') {
                const tabbed = tabbedItems(key, asList(p.items));
                if (tabbed) return `${h('h2', heading)}${tabbed}`;
            }
            return `${h('h2', heading)}${listMarkup(key, 'items', asList(p.items), 'title', 'body')}`;
        }
        case 'menu':
            return `${h('h2', heading)}${listMarkup(key, 'items', asList(p.items), 'name', 'description', (item, path) =>
                asString(item.price) ? slot('span', `${path}.price`, escapeHtml(asString(item.price)), ' class="price"') : '')}`;
        case 'gallery': {
            const images = asList(p.images);
            const figures = images.map((img, index) => {
                const path = `${key}.images.${index}`;
                const caption = asString(img.alt) || asString(img.query);
                const query = asString(img.query);
                const photo = asString(img.url) || asString(img.src)
                    ? `<img src="${escapeHtml(asString(img.url) || asString(img.src))}" alt="${escapeHtml(caption || 'Gallery')}" loading="eager" decoding="async" />`
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
            const facts = finishedContactFacts(p, siteTitle || 'us');
            return [
                slot('h2', `${key}.heading`, escapeHtml(facts.heading)),
                slot('p', `${key}.blurb`, escapeHtml(facts.blurb)),
                '<div class="contact-grid">',
                '<address>',
                facts.address
                    ? slot('p', `${key}.address`, escapeHtml(facts.address))
                    : `<p class="contact-note">${escapeHtml(facts.addressNote)}</p>`,
                facts.phone
                    ? `<p><a href="tel:${escapeHtml(facts.phone)}">${slot('span', `${key}.phone`, escapeHtml(facts.phone))}</a></p>`
                    : '',
                facts.email
                    ? `<p><a href="mailto:${escapeHtml(facts.email)}">${slot('span', `${key}.email`, escapeHtml(facts.email))}</a></p>`
                    : '',
                facts.hours
                    ? slot('p', `${key}.hours`, escapeHtml(facts.hours))
                    : `<p class="contact-note">${escapeHtml(facts.hoursNote)}</p>`,
                '</address>',
                workingForm(
                    facts.email ? `mailto:${facts.email}` : '#contact-form',
                    `<input type="text" name="name" placeholder="Your name" aria-label="Name" autocomplete="name" required />
        <input type="email" name="email" placeholder="you@example.com" aria-label="Email" autocomplete="email" required />
        <textarea name="message" rows="4" placeholder="How can we help?" aria-label="Message" required></textarea>`,
                    facts.ctaLabel,
                ),
                '</div>',
            ].join('');
        }
        case 'footer':
            return slot(
                'p',
                `${key}.tagline`,
                escapeHtml(finishedFooterTagline(p, siteTitle)),
            );
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
            const href = pageHref(page.path, current, page.href);
            const currentAttr =
                !page.navOnly && page.path === current && !page.href?.startsWith('#')
                    ? ' aria-current="page"'
                    : '';
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
  transition: color 0.18s ease;
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
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.cta:hover { opacity: 0.92; }
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
.contact-note { color: var(--muted); margin: 0.35rem 0; }
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

/* Casual / Starter: fully centre-paged on every viewport — no top-clustered stub */
[data-style="casual"] {
  text-align: center;
  overflow-x: clip;
}
[data-style="casual"] .site-header {
  justify-content: center;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
  text-align: center;
}
[data-style="casual"] .site-header nav {
  justify-content: center;
  flex-wrap: wrap;
}
[data-style="casual"] main {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: calc(100svh - 6rem);
  min-height: calc(100dvh - 6rem);
  justify-content: safe center;
  text-align: center;
  padding-block: 2rem 4rem;
  padding-inline: 1.25rem;
}
[data-style="casual"] section {
  width: min(100%, 42rem);
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: safe center;
  text-align: center;
}
[data-style="casual"] [data-type="hero"] {
  display: flex !important;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.75rem;
  min-height: min(88svh, 44rem);
  min-height: min(88dvh, 44rem);
  padding: 2.5rem 0;
  grid-template-columns: none !important;
  text-align: center;
}
[data-style="casual"] [data-type="hero"] .hero-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-inline: auto;
  max-width: 36rem;
  text-align: center;
}
[data-style="casual"] [data-type="hero"] .lede,
[data-style="casual"] .lede {
  margin-inline: auto;
  max-width: 34rem;
  text-align: center;
}
[data-style="casual"] [data-type="hero"] .img-slot {
  width: min(100%, 28rem);
  min-height: 14rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md, 0.5rem);
  margin-inline: auto;
}
[data-style="casual"] [data-type="gallery"] .img-slot { display: none; }
[data-style="casual"] .card {
  box-shadow: none;
  border: 1px solid var(--rule);
  text-align: left;
}
[data-style="casual"] .cards {
  width: 100%;
  margin-inline: auto;
  text-align: left;
}
[data-style="casual"] .contact-grid,
[data-style="casual"] .form {
  width: min(100%, 28rem);
  margin-inline: auto;
  text-align: left;
}
[data-style="casual"] .form button { justify-self: center; }
[data-style="casual"] [data-type="about"],
[data-style="casual"] [data-type="services"],
[data-style="casual"] [data-type="menu"],
[data-style="casual"] [data-type="contact"] {
  min-height: min(70svh, 36rem);
  min-height: min(70dvh, 36rem);
  justify-content: safe center;
  align-items: center;
  padding-block: 2.5rem;
  text-align: center;
}
[data-style="casual"] [data-type="footer"] {
  text-align: center;
  width: 100%;
  align-items: center;
}

/* Phones: same centre composition; svh-only so URL chrome does not clip */
@media (max-width: 48rem) {
  [data-style="casual"] .site-header {
    padding-inline: 1rem;
    gap: 0.65rem;
  }
  [data-style="casual"] main {
    min-height: calc(100svh - 5rem);
    padding-block: 1.25rem 2.75rem;
    padding-inline: 1rem;
  }
  [data-style="casual"] section {
    width: 100%;
  }
  [data-style="casual"] [data-type="hero"] {
    min-height: min(80svh, 36rem);
    padding: 1.75rem 0 2rem;
    gap: 1.25rem;
  }
  [data-style="casual"] [data-type="hero"] .img-slot {
    width: min(100%, 22rem);
    min-height: 11rem;
  }
  [data-style="casual"] h1 {
    font-size: clamp(1.65rem, 8vw, 2.35rem);
  }
  [data-style="casual"] [data-type="about"],
  [data-style="casual"] [data-type="services"],
  [data-style="casual"] [data-type="menu"],
  [data-style="casual"] [data-type="contact"] {
    min-height: min(70svh, 32rem);
    padding-block: 2rem;
  }
}

/* Tablets + small laptops: keep every band centre-paged in the viewport */
@media (min-width: 48.01rem) and (max-width: 64rem) {
  [data-style="casual"] main {
    min-height: calc(100svh - 5.5rem);
    min-height: calc(100dvh - 5.5rem);
    padding-inline: 1.5rem;
  }
  [data-style="casual"] [data-type="hero"] {
    min-height: min(84svh, 40rem);
    min-height: min(84dvh, 40rem);
  }
  [data-style="casual"] [data-type="about"],
  [data-style="casual"] [data-type="services"],
  [data-style="casual"] [data-type="menu"],
  [data-style="casual"] [data-type="contact"] {
    min-height: min(72svh, 34rem);
    min-height: min(72dvh, 34rem);
  }
}

/* Casual: plain system sans — Pro gets editorial Newsreader; keep Free simpler */
[data-style="casual"] h1,
[data-style="casual"] h2,
[data-style="casual"] h3 {
  font-family: "Avenir Next", Avenir, "Segoe UI", system-ui, sans-serif;
  font-size: clamp(1.85rem, 3.6vw, 2.75rem);
  font-weight: 650;
  letter-spacing: -0.015em;
  line-height: 1.15;
}
[data-style="casual"] h2,
[data-style="casual"] h3 {
  font-size: clamp(1.25rem, 2vw, 1.55rem);
  font-weight: 600;
}
[data-style="casual"] .lede {
  font-size: 1.05rem;
  max-width: 36rem;
}
/* Photo-rich (Pro): Newsreader editorial type + photographic layouts — clearly above Casual */
[data-style="photos"] {
  --display-font: Newsreader, "Iowan Old Style", Palatino, Georgia, serif;
  --display-weight: 500;
  --display-tracking: -0.028em;
}
[data-style="photos"] h1 {
  font-family: var(--display-font);
  font-size: clamp(2.35rem, 5.4vw, 4.1rem);
  font-weight: var(--display-weight, 500);
  letter-spacing: var(--display-tracking, -0.028em);
  line-height: 1.04;
  max-width: 14ch;
}
[data-style="photos"] h2 {
  font-family: var(--display-font);
  font-size: clamp(1.45rem, 2.3vw, 2rem);
  font-weight: 500;
  letter-spacing: -0.02em;
}
[data-style="photos"] .lede {
  font-size: clamp(1.1rem, 1.35vw, 1.28rem);
  line-height: 1.65;
  max-width: 38rem;
  color: color-mix(in srgb, var(--ink) 78%, var(--muted));
}
[data-style="photos"] [data-variant="image-bg"] {
  min-height: min(100dvh, 52rem);
  border-radius: 0;
}
[data-style="photos"] [data-variant="image-bg"] .hero-copy {
  padding: 5rem 2rem 3rem;
  text-align: center;
  justify-self: center;
  max-width: 40rem;
  width: 100%;
}
/* Pro: topic photograph as a full-site backdrop behind every page */
[data-style="photos"].site {
  position: relative;
  isolation: isolate;
  min-height: 100dvh;
}
[data-style="photos"].site::before {
  content: "";
  position: fixed;
  inset: -10% 0;
  z-index: -2;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg) 78%, transparent) 0%,
      color-mix(in srgb, var(--bg) 88%, transparent) 45%,
      color-mix(in srgb, var(--bg) 92%, transparent) 100%
    ),
    var(--page-photo, none) center / cover no-repeat;
  background-color: var(--bg);
  transform: translate3d(0, var(--pc-bg-shift, 0px), 0) scale(1.08);
  will-change: transform;
}
[data-style="photos"] .site-header {
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(14px) saturate(1.1);
}
[data-style="photos"] main {
  position: relative;
  z-index: 1;
}
[data-style="photos"] section:not([data-variant="image-bg"]) {
  background: color-mix(in srgb, var(--panel) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--rule) 70%, transparent);
  border-radius: var(--radius-lg, 0.85rem);
  padding: 2rem 1.5rem;
  margin-block: 1rem;
  backdrop-filter: blur(8px);
}
[data-style="photos"] [data-type="footer"] {
  background: transparent;
  border: 0;
  backdrop-filter: none;
}
/* Smooth Pro page transitions between HTML files */
html.pc-page-ready [data-style="photos"].site {
  animation: pc-page-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
}
html.pc-page-leave [data-style="photos"].site {
  animation: pc-page-out 0.28s ease both;
}
@keyframes pc-page-in {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}
@keyframes pc-page-out {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translateY(-10px); }
}
[data-style="photos"] .wordmark {
  font-family: var(--display-font);
  font-weight: 600;
  letter-spacing: -0.02em;
}
[data-style="photos"] .img-slot {
  border-radius: var(--radius-lg, 0.85rem);
  box-shadow: 0 10px 28px -10px color-mix(in srgb, var(--ink) 12%, transparent);
  transition: box-shadow .3s ease;
  overflow: hidden;
}
[data-style="photos"] .img-slot img {
  transition: transform .55s cubic-bezier(.22,.61,.36,1);
  will-change: transform;
  transform: scale(1.001);
}
[data-style="photos"] .img-slot:hover img {
  transform: scale(1.06);
}
[data-style="photos"] [data-variant="image-bg"] .img-slot img {
  transform: translate3d(0, var(--pc-hero-shift, 0px), 0) scale(1.08);
  transition: transform .12s linear;
}
[data-style="photos"] [data-variant="image-bg"]:hover .img-slot img {
  transform: translate3d(0, var(--pc-hero-shift, 0px), 0) scale(1.12);
}
[data-style="photos"] .card {
  border-radius: var(--radius-lg, 0.85rem);
  box-shadow: 0 8px 24px -6px color-mix(in srgb, var(--ink) 8%, transparent);
  transition: transform .28s cubic-bezier(.22,.61,.36,1), box-shadow .28s ease, border-color .22s ease;
}
[data-style="photos"] .card:hover {
  transform: translateY(-5px);
  border-color: color-mix(in srgb, var(--accent) 35%, var(--rule));
  box-shadow: 0 18px 40px -10px color-mix(in srgb, var(--ink) 16%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  html.pc-page-ready [data-style="photos"].site,
  html.pc-page-leave [data-style="photos"].site { animation: none; }
  [data-style="photos"] .img-slot img,
  [data-style="photos"] [data-variant="image-bg"] .img-slot img,
  [data-style="photos"] .card,
  [data-style="photos"].site::before {
    transition: none !important;
    transform: none !important;
    will-change: auto;
  }
  [data-style="photos"] .img-slot:hover img,
  [data-style="photos"] .card:hover {
    transform: none !important;
  }
}
[data-style="photos"] details, [data-style="motion"] details {
  border: 1px solid var(--rule);
  border-radius: var(--radius-md, 0.6rem);
  background: var(--panel);
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
  transition: background-color .2s ease, border-color .2s ease, box-shadow .2s ease;
}
[data-style="photos"] details[open], [data-style="motion"] details[open] {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--rule));
  box-shadow: 0 6px 20px -6px color-mix(in srgb, var(--accent) 15%, transparent);
}
details summary {
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}
details summary::-webkit-details-marker { display: none; }
details summary::after {
  content: "+";
  font-size: 1.3rem;
  line-height: 1;
  font-weight: 400;
  color: var(--accent);
  transition: transform .2s ease;
}
details[open] summary::after {
  content: "−";
  transform: rotate(180deg);
}

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
  --bg: #08070a;
  --ink: #f7f4ef;
  --muted: #b8b0a4;
  /* Champagne gold — not hot pink. Themes can still tint via --accent on CTAs. */
  --accent: #c8a962;
  --accent-ink: #0c0a09;
  --panel: rgba(255, 255, 255, 0.05);
  --rule: rgba(255, 255, 255, 0.12);
  --display-font: "Bodoni Moda", Didot, "Bodoni MT", "Times New Roman", serif;
  --display-weight: 400;
  --display-tracking: 0.045em;
  background: #08070a;
  color: #f7f4ef;
}
[data-style="motion"] .site-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 8;
  max-width: none;
  padding-inline: 6vw;
  background: linear-gradient(to bottom, rgba(8, 7, 10, 0.72), transparent);
  backdrop-filter: none;
  border-bottom: 0;
}
[data-style="motion"] .site-header nav a { color: rgba(247, 244, 239, 0.72); }
[data-style="motion"] .site-header nav a:hover { color: #fff; }
[data-style="motion"] .wordmark {
  font-family: var(--display-font);
  font-weight: var(--display-weight);
  letter-spacing: var(--display-tracking);
  text-transform: none;
}
[data-style="motion"] main {
  max-width: none;
  padding-inline: 0;
  padding-bottom: 0;
  counter-reset: pc-sec;
}
/* Full-bleed hero — no card frame, no section padding gaps, photo edge to edge */
[data-style="motion"] [data-type="hero"] {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr;
  place-items: center;
  text-align: center;
  width: 100%;
  max-width: none;
  min-height: 100vh;
  min-height: 100svh;
  margin: 0;
  padding: 0;
  padding-block: 0;
  border-radius: 0;
}
[data-style="motion"] [data-type="hero"][data-variant="image-bg"],
[data-style="motion"] [data-type="hero"][data-variant="centred"] {
  min-height: 100vh;
  min-height: 100svh;
  padding: 0;
  padding-block: 0;
  border-radius: 0;
}
@media (max-width: 48rem) {
  [data-style="motion"] .site-header {
    padding-inline: 1.15rem;
  }
  [data-style="motion"] [data-type="hero"] {
    min-height: 100svh;
  }
}
[data-style="motion"] [data-type="hero"] .img-slot {
  display: block;
  position: absolute;
  inset: 0;
  z-index: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  min-height: 100%;
  height: 100%;
  width: 100%;
  overflow: hidden;
  opacity: 0.88;
  background: transparent;
  animation: pc-kenburns 26s ease-in-out infinite alternate;
  will-change: transform;
}
[data-style="motion"] [data-type="hero"][data-variant="image-bg"] .img-slot {
  position: absolute;
  inset: 0;
  border-radius: 0;
  min-height: 100%;
  height: 100%;
}
[data-style="motion"] [data-type="hero"] .img-slot img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 100%;
  max-width: none;
  object-fit: cover;
  object-position: center;
  border-radius: 0;
}
[data-style="motion"] [data-type="hero"][data-variant="image-bg"] .img-slot img,
[data-style="motion"] [data-type="hero"] img {
  width: 100%;
  height: 100%;
  max-width: none;
  object-fit: cover;
  border-radius: 0;
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
  margin: 0;
  padding: 7rem 6vw 8.5rem;
  align-self: center;
  justify-self: center;
  background: none;
  color: inherit;
}
[data-style="motion"] [data-type="hero"][data-variant="image-bg"] .hero-copy {
  padding: 7rem 6vw 8.5rem;
  background: none;
  align-self: center;
  max-width: min(52rem, 88vw);
}
[data-style="motion"] [data-type="hero"] .lede {
  margin-inline: auto;
  max-width: 42ch;
  font-size: clamp(1.05rem, 1.45vw, 1.28rem);
  line-height: 1.65;
  letter-spacing: 0.01em;
  color: rgba(247, 244, 239, 0.9);
  text-shadow: 0 1px 14px rgba(8, 5, 16, 0.7);
}
[data-style="motion"] [data-type="hero"] h1 {
  font-family: var(--display-font);
  font-size: clamp(2.4rem, 7vw, 5.4rem);
  font-weight: var(--display-weight);
  letter-spacing: var(--display-tracking);
  line-height: 1.05;
  margin: 0 auto 0.7em;
  max-width: min(16ch, 100%);
  overflow-wrap: break-word;
  text-wrap: balance;
  color: #f7f4ef;
  background: linear-gradient(
    165deg,
    #fff8ef 0%,
    #f7f4ef 38%,
    color-mix(in srgb, var(--accent) 75%, #fff) 72%,
    #e8d5a3 100%
  );
  background-size: 100% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 2px 22px rgba(8, 5, 16, 0.55));
  animation: none;
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
  color: color-mix(in srgb, var(--accent) 85%, #fff);
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
    radial-gradient(ellipse 46% 36% at 86% 12%, rgba(200, 169, 98, 0.35), transparent 64%),
    radial-gradient(ellipse 42% 38% at 72% 86%, rgba(245, 158, 11, 0.28), transparent 62%);
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
  font-size: clamp(2.2rem, 5.5vw, 4.2rem);
  font-weight: 400;
  letter-spacing: 0.08em;
  line-height: 1;
  white-space: nowrap;
  color: color-mix(in srgb, var(--accent) 55%, #fff);
  opacity: 0.14;
  text-transform: uppercase;
}
[data-style="motion"] .motion-ticker p {
  display: inline-block;
  max-width: none;
  margin: 0;
  font-family: var(--display-font);
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
    continuous = false,
): string {
    const site = {
        title: composition.meta.title || '',
        description: composition.meta.description || '',
        vertical: composition.vertical || '',
    };
    if (page.kind === 'settings') return settingsPageHtml(composition);
    if (page.kind === 'about' && page.sections.length === 0) return syntheticAboutHtml(composition);
    if (page.kind === 'contact' && page.sections.length === 0) return syntheticContactHtml(composition);
    return page.sections
        .map((section, index) => renderSection(section, index, visible, motif, continuous, site))
        .join('\n');
}

function heroPhotoUrl(composition: Composition): string {
    const hero = composition.sections.find((s) => s.visible && s.type === 'hero');
    const image = hero?.props?.image;
    if (image && typeof image === 'object' && !Array.isArray(image)) {
        const rec = image as Record<string, unknown>;
        const url = asString(rec.url) || asString(rec.src);
        if (url.startsWith('http')) return url;
    }
    return '';
}

/** Soft fade between Pro HTML pages — mirrors the app glide, stays self-contained. */
const PAGE_TRANSITION_JS = `(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('pc-page-ready');
  if (reduce) return;
  document.addEventListener('click', (event) => {
    const a = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(a instanceof HTMLAnchorElement)) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (a.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    if (!/\\.html?$/i.test(url.pathname) && !url.pathname.endsWith('/')) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    event.preventDefault();
    document.documentElement.classList.add('pc-page-leave');
    window.setTimeout(() => { location.href = url.href; }, 260);
  });
})();`;

/**
 * Pro “alive” detail — subtle scroll parallax on the photo backdrop and hero,
 * plus CSS hover zoom on cards/images. Quiet enough to stay below Premium.
 */
const PRO_PARALLAX_JS = `(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const site = document.querySelector('[data-style="photos"].site');
  if (!(site instanceof HTMLElement)) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY || 0;
    const bg = Math.max(-28, Math.min(28, y * 0.08));
    const hero = Math.max(-36, Math.min(36, y * 0.12));
    site.style.setProperty('--pc-bg-shift', bg.toFixed(1) + 'px');
    site.style.setProperty('--pc-hero-shift', hero.toFixed(1) + 'px');
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }, { passive: true });
  update();
})();`;

/** A generated site as the file tree persistence already stores. */
export function compositionToFiles(
    composition: Composition,
    style?: StyleId,
    seed = '',
): FileMap {
    // Premium only. interactionKit returns nothing for the other two looks, so a Free or Pro
    // page ships byte-identical to before.
    const interaction = style ? interactionKit(style, seed, composition.vertical) : [];
    const continuous = style === 'motion';
    const visible = composition.sections.filter((s) => s.visible);
    const pages = planSitePages(composition, { continuous });
    const filePages = pages.filter((page) => !page.navOnly);
    const title = composition.meta.title || 'Home';
    const chrome = style ? chromeForStyleId(style) : null;
    const styleAttr = style ? ` data-style="${escapeHtml(style)}"` : '';
    const chromeAttr = chrome ? ` data-chrome="${escapeHtml(chrome)}"` : '';
    const photoUrl = style === 'photos' ? heroPhotoUrl(composition) : '';
    const photoStyle = photoUrl
        ? ` style="--page-photo: url('${escapeHtml(photoUrl)}')"`
        : '';
    const motif = continuous
        ? `${motionStageMarkup()}${motionMotifMarkup(composition.vertical, `${composition.meta.title} ${composition.meta.description}`)}${motionTickerMarkup(composition.meta.title)}`
        : '';
    const chromeCss = chrome ? tierChromeCss(chrome) : '';
    const baseCss = [
        PAGE_CSS,
        chromeCss,
        continuous ? MOTION_CSS : '',
        continuous ? PREMIUM_CSS : '',
        continuous ? CONTINUOUS_SCROLL_CSS : '',
    ].join('');
    const baseJs = [
        continuous ? PREMIUM_JS : '',
        style === 'photos' ? PAGE_TRANSITION_JS : '',
        style === 'photos' ? PRO_PARALLAX_JS : '',
    ].filter(Boolean).join('\n');
    const footers = visible.filter((s) => s.type === 'footer');
    const site = {
        title: composition.meta.title || '',
        description: composition.meta.description || '',
        vertical: composition.vertical || '',
    };
    const files: FileMap = {};

    for (const page of filePages) {
        const inner = [
            pageInner(page, composition, visible, motif, continuous),
            footers
                .map((section, index) =>
                    renderSection(section, index, visible, '', continuous, site),
                )
                .join('\n'),
        ].join('\n');
        const tabbed = inner.includes('data-tabs');
        const css = tabbed ? `${baseCss}${TABS_CSS}` : baseCss;
        const scripts = [tabbed ? TABS_JS : '', baseJs].filter(Boolean).join('\n');
        const deckOpen = continuous ? `<div class="liquid-deck" id="top">` : `<main id="top">`;
        const deckClose = continuous ? `</div>` : `</main>`;
        const siteClass = continuous ? ' site-liquid' : '';

        const body = [
            `<style>${css}</style>`,
            `<div class="site${siteClass}"${styleAttr}${chromeAttr}${photoStyle}>`,
            siteNav(pages, page.path, title),
            deckOpen,
            inner,
            deckClose,
            `</div>`,
            scripts ? `<script>\n${scripts}\n</script>` : '',
        ].filter(Boolean).join('\n');

        files[page.path] = compositionShell({
            title: composition.meta.title,
            description: composition.meta.description,
            lang: composition.meta.lang,
            artDirection: composition.artDirection,
            body,
            interaction,
            fontLinks: lookFontLinks(style),
        });
    }

    return files;
}

/** Premium continuous scroll — one section per viewport, like pagecrafts.in. */
const CONTINUOUS_SCROLL_CSS = `
html:has([data-style="motion"].site-liquid) {
  scroll-behavior: smooth;
  scroll-snap-type: y proximity;
}
[data-style="motion"].site-liquid {
  min-height: 100svh;
  min-height: 100dvh;
  overflow-x: clip;
}
[data-style="motion"] .liquid-deck {
  display: flex;
  flex-direction: column;
}
[data-style="motion"] .liquid-slide,
[data-style="motion"] section.liquid-slide {
  /* svh first so phone URL chrome does not clip centred slides */
  min-height: 100svh;
  min-height: 100dvh;
  height: auto;
  display: flex;
  flex-direction: column;
  justify-content: safe center;
  align-items: center;
  text-align: center;
  padding: 5rem 6vw;
  padding-top: max(5rem, calc(env(safe-area-inset-top, 0px) + 4.25rem));
  padding-bottom: max(2.5rem, env(safe-area-inset-bottom, 0px));
  scroll-snap-align: start;
  scroll-snap-stop: normal;
  box-sizing: border-box;
}
[data-style="motion"] .liquid-slide > *,
[data-style="motion"] section.liquid-slide > * {
  width: min(100%, 48rem);
  max-width: 100%;
}
[data-style="motion"] [data-type="hero"].liquid-slide {
  padding: 6rem 6vw 5rem;
  padding-top: max(6rem, calc(env(safe-area-inset-top, 0px) + 4.5rem));
}
[data-style="motion"] [data-type="footer"].liquid-slide {
  min-height: auto;
  padding-block: 3rem;
  justify-content: center;
}
[data-style="motion"] .cards,
[data-style="motion"] .contact-grid,
[data-style="motion"] .form {
  text-align: left;
  margin-inline: auto;
}
@media (max-width: 48rem) {
  [data-style="motion"] .liquid-slide,
  [data-style="motion"] section.liquid-slide {
    /* Prefer small viewport on phones — dvh overshoots when chrome is visible */
    min-height: 100svh;
    padding-inline: 1.15rem;
    padding-top: max(4.75rem, calc(env(safe-area-inset-top, 0px) + 3.75rem));
    padding-bottom: max(2rem, env(safe-area-inset-bottom, 0px));
  }
  [data-style="motion"] [data-type="hero"].liquid-slide {
    min-height: 100svh;
    padding-inline: 1.15rem;
    padding-top: max(5rem, calc(env(safe-area-inset-top, 0px) + 4rem));
  }
  [data-style="motion"] [data-type="hero"] h1 {
    font-size: clamp(1.85rem, 9vw, 2.75rem);
  }
  [data-style="motion"] [data-type="footer"].liquid-slide {
    min-height: auto;
    padding: 2.25rem 1.15rem;
  }
  /* Tall copy: grow the slide instead of clipping under the sticky bar */
  [data-style="motion"] .liquid-slide:has(.cards),
  [data-style="motion"] .liquid-slide:has(.contact-grid),
  [data-style="motion"] .liquid-slide:has(.form) {
    justify-content: flex-start;
    padding-top: max(5.25rem, calc(env(safe-area-inset-top, 0px) + 4.25rem));
  }
}
@media (prefers-reduced-motion: reduce) {
  html:has([data-style="motion"].site-liquid) {
    scroll-behavior: auto;
    scroll-snap-type: none;
  }
}
`;
