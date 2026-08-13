import type { Composition, FileMap, SectionInstance, SectionKey } from '@/lib/contracts';
import { compositionShell } from '@/lib/render/page-shell';

/**
 * D15 — turn a composition into a file tree the rest of the product already
 * knows how to save.
 *
 * Until now `runJob` produced a `Composition` and stopped. `putProjectFiles`
 * and `recordCommit` were ready; nothing turned the composition into a
 * `FileMap`. A dial that never reaches markup is a dial that does not exist,
 * and a generation that never becomes a file is not a site.
 *
 * Images stay as search queries, not Unsplash URLs — picking a photograph is
 * an editor action (and needs an id we do not have at generation time). The
 * slot is marked so the picker can find it.
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

function imageSlot(value: unknown, fallbackAlt: string): string {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const rec = value as Record<string, unknown>;
        const query = asString(rec.query);
        const alt = asString(rec.alt) || fallbackAlt;
        return `<div class="img-slot" role="img" aria-label="${escapeHtml(alt)}" data-query="${escapeHtml(query)}"></div>`;
    }
    if (typeof value === 'string' && value) {
        return `<div class="img-slot" role="img" aria-label="${escapeHtml(fallbackAlt)}" data-query="${escapeHtml(value)}"></div>`;
    }
    return '';
}

function listMarkup(
    items: Record<string, unknown>[],
    titleKey: string,
    bodyKey: string,
    extra?: (item: Record<string, unknown>) => string,
): string {
    if (items.length === 0) return '';
    return `<ul>${items.map((item) => {
        const title = asString(item[titleKey]);
        const body = asString(item[bodyKey]);
        const more = extra?.(item) ?? '';
        return `<li><strong>${escapeHtml(title)}</strong>${body ? `<p>${escapeHtml(body)}</p>` : ''}${more}</li>`;
    }).join('')}</ul>`;
}

function renderSection(section: SectionInstance, index: number): string {
    const p = section.props;
    const heading = asString(p.heading);
    const open = `<section id="${escapeHtml(section.id)}" data-type="${section.type}" data-variant="${escapeHtml(section.variant)}" data-animate style="--i:${index}">`;
    const close = '</section>';

    const inner = renderInner(section.type, p, heading);
    return `${open}${inner}${close}`;
}

function renderInner(type: SectionKey, p: Record<string, unknown>, heading: string): string {
    const h = (tag: 'h1' | 'h2', text: string) =>
        text ? `<${tag}>${escapeHtml(text)}</${tag}>` : '';

    switch (type) {
        case 'hero':
            return [
                asString(p.eyebrow) ? `<p class="eyebrow">${escapeHtml(asString(p.eyebrow))}</p>` : '',
                h('h1', asString(p.heading)),
                asString(p.sub) ? `<p>${escapeHtml(asString(p.sub))}</p>` : '',
                asString(p.ctaLabel) ? `<a class="cta" href="#contact">${escapeHtml(asString(p.ctaLabel))}</a>` : '',
                imageSlot(p.image, asString(p.heading) || 'Hero'),
            ].join('');
        case 'about':
            return `${h('h2', heading)}${asString(p.body) ? `<p>${escapeHtml(asString(p.body))}</p>` : ''}${imageSlot(p.image, heading || 'About')}`;
        case 'services':
            return `${h('h2', heading)}${listMarkup(asList(p.items), 'title', 'body')}`;
        case 'menu':
            return `${h('h2', heading)}${listMarkup(asList(p.items), 'name', 'description', (item) =>
                asString(item.price) ? `<span class="price">${escapeHtml(asString(item.price))}</span>` : '')}`;
        case 'gallery': {
            const images = asList(p.images);
            const figures = images.map((img) =>
                `<figure>${imageSlot(img, asString(img.alt) || asString(img.query) || 'Gallery')}<figcaption>${escapeHtml(asString(img.alt) || asString(img.query))}</figcaption></figure>`,
            ).join('');
            return `${h('h2', heading)}<div class="gallery">${figures}</div>`;
        }
        case 'team':
            return `${h('h2', heading)}${listMarkup(asList(p.members), 'name', 'bio', (item) =>
                asString(item.role) ? `<p class="role">${escapeHtml(asString(item.role))}</p>` : '')}`;
        case 'testimonials':
            return `${h('h2', heading)}${asList(p.items).map((item) =>
                `<blockquote><p>${escapeHtml(asString(item.quote))}</p>${asString(item.author) ? `<cite>${escapeHtml(asString(item.author))}</cite>` : ''}</blockquote>`,
            ).join('')}`;
        case 'faq':
            return `${h('h2', heading)}${asList(p.items).map((item) =>
                `<details><summary>${escapeHtml(asString(item.question))}</summary><p>${escapeHtml(asString(item.answer))}</p></details>`,
            ).join('')}`;
        case 'contact':
            return [
                h('h2', heading),
                asString(p.blurb) ? `<p>${escapeHtml(asString(p.blurb))}</p>` : '',
                '<address>',
                asString(p.address) ? `<p>${escapeHtml(asString(p.address))}</p>` : '',
                asString(p.phone) ? `<p><a href="tel:${escapeHtml(asString(p.phone))}">${escapeHtml(asString(p.phone))}</a></p>` : '',
                asString(p.email) ? `<p><a href="mailto:${escapeHtml(asString(p.email))}">${escapeHtml(asString(p.email))}</a></p>` : '',
                asString(p.hours) ? `<p>${escapeHtml(asString(p.hours))}</p>` : '',
                '</address>',
            ].join('');
        case 'footer':
            return `<p>${escapeHtml(asString(p.tagline))}</p>`;
        default: {
            const exhaustive: never = type;
            return exhaustive;
        }
    }
}

const PAGE_CSS = `
main { max-width: 72rem; margin: 0 auto; padding-inline: 1.5rem; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.75rem; color: var(--muted); }
.cta {
  display: inline-block; margin-top: 1rem; padding: 0.7rem 1.2rem;
  background: var(--accent); color: var(--accent-ink);
  border-radius: var(--radius-md); text-decoration: none; font-weight: 600;
}
.img-slot {
  min-height: 12rem; background: var(--panel); border: var(--border-width) solid var(--rule);
  border-radius: var(--radius-md);
}
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: var(--stack-gap); }
.price { color: var(--muted); margin-left: 0.5rem; }
blockquote { margin: 0 0 var(--stack-gap); padding-left: 1rem; border-left: 3px solid var(--accent); }
cite { display: block; color: var(--muted); font-style: normal; margin-top: 0.4rem; }
details { border-bottom: 1px solid var(--rule); padding: 0.75rem 0; }
address { font-style: normal; }
ul { padding-left: 1.1rem; }
[data-type="footer"] { color: var(--muted); font-size: 0.9rem; }
`;

/** A generated site as the file tree persistence already stores. */
export function compositionToFiles(composition: Composition): FileMap {
    const visible = composition.sections.filter((s) => s.visible);
    const body = `<style>${PAGE_CSS}</style>\n<main>\n${visible.map(renderSection).join('\n')}\n</main>`;

    return {
        'index.html': compositionShell({
            title: composition.meta.title,
            description: composition.meta.description,
            lang: composition.meta.lang,
            artDirection: composition.artDirection,
            body,
        }),
    };
}
