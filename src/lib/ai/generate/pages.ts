import type { Composition, FileMap, SectionInstance, SectionKey } from '@/lib/contracts';

export interface SitePage {
    path: string;
    label: string;
    sections: SectionInstance[];
    kind: 'content' | 'about' | 'contact' | 'settings';
}

const PAGE_FOR: Partial<Record<SectionKey, { path: string; label: string }>> = {
    hero: { path: 'index.html', label: 'Home' },
    about: { path: 'about.html', label: 'About' },
    services: { path: 'services.html', label: 'Services' },
    menu: { path: 'menu.html', label: 'Menu' },
    gallery: { path: 'gallery.html', label: 'Gallery' },
    team: { path: 'team.html', label: 'Team' },
    testimonials: { path: 'stories.html', label: 'Stories' },
    faq: { path: 'faq.html', label: 'FAQ' },
    contact: { path: 'contact.html', label: 'Contact' },
};

function esc(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function contactProps(composition: Composition): Record<string, unknown> {
    const contact = composition.sections.find((s) => s.visible && s.type === 'contact');
    return contact?.props ?? {};
}

/**
 * Split a composition into real HTML files: Home, at least two more content
 * pages, then Settings last. Empty gaps are filled from facts already on the
 * composition so a thin plan still ships a working site.
 */
export function planSitePages(composition: Composition): SitePage[] {
    const visible = composition.sections.filter((s) => s.visible);
    const pages: SitePage[] = [];

    const hero = visible.filter((s) => s.type === 'hero');
    pages.push({
        path: 'index.html',
        label: 'Home',
        sections: hero,
        kind: 'content',
    });

    for (const section of visible) {
        if (section.type === 'hero' || section.type === 'footer') continue;
        const meta = PAGE_FOR[section.type];
        if (!meta) continue;
        const existing = pages.find((page) => page.path === meta.path);
        if (existing) {
            existing.sections.push(section);
        } else {
            pages.push({
                path: meta.path,
                label: meta.label,
                sections: [section],
                kind: section.type === 'contact' ? 'contact' : 'content',
            });
        }
    }

    if (!pages.some((page) => page.path === 'about.html')) {
        pages.splice(1, 0, {
            path: 'about.html',
            label: 'About',
            sections: visible.filter((s) => s.type === 'about'),
            kind: 'about',
        });
    }

    if (!pages.some((page) => page.path === 'contact.html')) {
        pages.push({
            path: 'contact.html',
            label: 'Contact',
            sections: visible.filter((s) => s.type === 'contact'),
            kind: 'contact',
        });
    }

    pages.push({
        path: 'settings.html',
        label: 'Settings',
        sections: [],
        kind: 'settings',
    });

    return pages;
}

export function pageHref(path: string, current: string): string {
    return path === current ? '#top' : path;
}

export function workingForm(action: string, fields: string, submit: string): string {
    const mailto = action.startsWith('mailto:') ? ` action="${esc(action)}"` : ' action="#"';
    return `<form class="form" method="post"${mailto} data-working-form>
${fields}
<button type="submit">${esc(submit)}</button>
<p class="form-status" hidden role="status"></p>
</form>`;
}

export function syntheticAboutHtml(composition: Composition): string {
    const title = composition.meta.title || 'About';
    const body = composition.meta.description
        || `${title} — ${asString(composition.vertical).replace(/-/g, ' ')}.`;
    return `<section id="about" data-section="about" data-type="about" data-animate>
<h2>About ${esc(title)}</h2>
<p>${esc(body)}</p>
</section>`;
}

export function syntheticContactHtml(composition: Composition): string {
    const p = contactProps(composition);
    const email = asString(p.email) || 'hello@example.com';
    const phone = asString(p.phone);
    const address = asString(p.address);
    const hours = asString(p.hours);
    const heading = asString(p.heading) || 'Contact';
    const blurb = asString(p.blurb) || `Reach ${composition.meta.title || 'us'} — we reply on this page.`;
    return `<section id="contact" data-section="contact" data-type="contact" data-animate>
<h2>${esc(heading)}</h2>
<p>${esc(blurb)}</p>
<div class="contact-grid">
<address>
${address ? `<p>${esc(address)}</p>` : ''}
${phone ? `<p><a href="tel:${esc(phone)}">${esc(phone)}</a></p>` : ''}
<p><a href="mailto:${esc(email)}">${esc(email)}</a></p>
${hours ? `<p>${esc(hours)}</p>` : ''}
</address>
${workingForm(
        `mailto:${email}`,
        `<input type="text" name="name" placeholder="Your name" aria-label="Name" autocomplete="name" required />
<input type="email" name="email" placeholder="you@example.com" aria-label="Email" autocomplete="email" required />
<textarea name="message" rows="4" placeholder="How can we help?" aria-label="Message" required></textarea>`,
        asString(p.ctaLabel) || 'Send',
    )}
</div>
</section>`;
}

export function settingsPageHtml(composition: Composition): string {
    const p = contactProps(composition);
    const title = composition.meta.title || 'This business';
    const email = asString(p.email) || 'hello@example.com';
    const phone = asString(p.phone);
    const hours = asString(p.hours);
    const address = asString(p.address);
    return `<section id="settings" data-section="settings" data-type="about" data-animate>
<h2>Settings</h2>
<p>Hours, contact, and how this site reaches people. These are the facts this website was built from.</p>
<dl class="settings-list">
<dt>Business</dt><dd>${esc(title)}</dd>
<dt>About</dt><dd>${esc(composition.meta.description || '—')}</dd>
${address ? `<dt>Place</dt><dd>${esc(address)}</dd>` : ''}
${phone ? `<dt>Phone</dt><dd><a href="tel:${esc(phone)}">${esc(phone)}</a></dd>` : ''}
<dt>Email</dt><dd><a href="mailto:${esc(email)}">${esc(email)}</a></dd>
${hours ? `<dt>Hours</dt><dd>${esc(hours)}</dd>` : ''}
</dl>
<h3>Message the business</h3>
${workingForm(
        `mailto:${email}?subject=${encodeURIComponent(`Settings — ${title}`)}`,
        `<input type="text" name="name" placeholder="Your name" aria-label="Name" autocomplete="name" required />
<input type="email" name="email" placeholder="you@example.com" aria-label="Email" autocomplete="email" required />
<textarea name="message" rows="4" placeholder="A note about hours, contact, or this site" aria-label="Message" required></textarea>`,
        'Send',
    )}
</section>`;
}

export function htmlPagesOf(files: FileMap): string[] {
    return Object.keys(files)
        .filter((path) => /\.html?$/i.test(path) && path !== 'composition.json')
        .sort((a, b) => {
            if (a === 'index.html') return -1;
            if (b === 'index.html') return 1;
            if (a === 'settings.html') return 1;
            if (b === 'settings.html') return -1;
            return a.localeCompare(b);
        });
}
