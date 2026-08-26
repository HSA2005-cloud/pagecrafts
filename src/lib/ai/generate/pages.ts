import type { Composition, FileMap, SectionInstance, SectionKey } from '@/lib/contracts';

export interface SitePage {
    path: string;
    label: string;
    sections: SectionInstance[];
    kind: 'content' | 'about' | 'contact' | 'settings';
    /** Nav href when different from the file path (hash links on a continuous Premium site). */
    href?: string;
    /** Hash-nav entry that must not emit a separate HTML file. */
    navOnly?: boolean;
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

const NAV_LABEL: Partial<Record<SectionKey, string>> = {
    hero: 'Home',
    about: 'About',
    services: 'Services',
    menu: 'Menu',
    gallery: 'Gallery',
    team: 'Team',
    testimonials: 'Stories',
    faq: 'FAQ',
    contact: 'Contact',
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
 * Honesty pass for empty optional contact facts.
 * Never invent phone/email/address — fill the section with finished visitor copy instead.
 */
export interface FinishedContactFacts {
    heading: string;
    blurb: string;
    ctaLabel: string;
    address: string;
    phone: string;
    email: string;
    hours: string;
    /** Shown when address was not given — visitor-facing, not a fake street. */
    addressNote: string;
    /** Shown when hours were not given. */
    hoursNote: string;
}

export function finishedContactFacts(
    props: Record<string, unknown>,
    siteTitle = 'us',
): FinishedContactFacts {
    const title = siteTitle.trim() || 'us';
    return {
        heading: asString(props.heading) || 'Get in touch',
        blurb:
            asString(props.blurb) ||
            `Send ${title} a message — we read every note and reply as soon as we can.`,
        ctaLabel: asString(props.ctaLabel) || 'Send message',
        address: asString(props.address),
        phone: asString(props.phone),
        email: asString(props.email),
        hours: asString(props.hours),
        addressNote: 'Prefer to message first — we will share directions when you write.',
        hoursNote: 'Hours by appointment — message us to book a time.',
    };
}

export function finishedAboutBody(
    props: Record<string, unknown>,
    meta: { title?: string; description?: string; vertical?: string },
): string {
    const body = asString(props.body);
    if (body) return body;
    if (meta.description?.trim()) return meta.description.trim();
    const title = meta.title?.trim() || 'This business';
    const vertical = (meta.vertical ?? '').replace(/-/g, ' ').trim();
    return vertical ? `${title} — ${vertical}.` : `${title} — a simple site for what we do.`;
}

export function finishedFooterTagline(
    props: Record<string, unknown>,
    siteTitle = '',
): string {
    return asString(props.tagline) || siteTitle.trim() || 'Thanks for visiting.';
}

export interface PlanSitePagesOptions {
    /**
     * Premium continuous scroll — one Home deck with every section, hash nav,
     * Settings still a separate page. Matches pagecrafts.in / signature templates.
     */
    continuous?: boolean;
}

/**
 * Split a composition into real HTML files: Home, at least two more content
 * pages, then Settings last. Empty gaps are filled from facts already on the
 * composition so a thin plan still ships a working site.
 *
 * When `continuous` is set (Premium), Home holds the full scroll deck instead.
 */
export function planSitePages(
    composition: Composition,
    opts: PlanSitePagesOptions = {},
): SitePage[] {
    if (opts.continuous) return planContinuousPages(composition);

    const visible = composition.sections.filter((s) => s.visible);
    const pages: SitePage[] = [];

    const hero = visible.filter((s) => s.type === 'hero');
    // Home must feel finished on first open — not a lone hero above an empty main.
    const homeBody = visible.filter(
        (s) => s.type === 'about' || s.type === 'services' || s.type === 'menu',
    );
    pages.push({
        path: 'index.html',
        label: 'Home',
        sections: [...hero, ...homeBody],
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

/** One continuous Premium deck + Settings. */
function planContinuousPages(composition: Composition): SitePage[] {
    const visible = composition.sections.filter((s) => s.visible && s.type !== 'footer');
    const pages: SitePage[] = [
        {
            path: 'index.html',
            href: '#top',
            label: 'Home',
            sections: visible,
            kind: 'content',
        },
    ];

    for (const section of visible) {
        if (section.type === 'hero') continue;
        const label = NAV_LABEL[section.type];
        if (!label) continue;
        if (pages.some((p) => p.label === label)) continue;
        pages.push({
            path: 'index.html',
            href: `#${section.type}`,
            label,
            sections: [],
            kind: section.type === 'contact' ? 'contact' : 'content',
            navOnly: true,
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

export function pageHref(path: string, current: string, href?: string): string {
    if (href) return href;
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
    const about = composition.sections.find((s) => s.visible && s.type === 'about');
    const body = finishedAboutBody(about?.props ?? {}, {
        title: composition.meta.title,
        description: composition.meta.description,
        vertical: composition.vertical,
    });
    return `<section id="about" data-section="about" data-type="about" data-animate>
<h2>About ${esc(title)}</h2>
<p>${esc(body)}</p>
</section>`;
}

export function syntheticContactHtml(composition: Composition): string {
    const facts = finishedContactFacts(contactProps(composition), composition.meta.title || 'us');
    const formAction = facts.email ? `mailto:${facts.email}` : '#contact-form';
    return `<section id="contact" data-section="contact" data-type="contact" data-animate>
<h2>${esc(facts.heading)}</h2>
<p>${esc(facts.blurb)}</p>
<div class="contact-grid">
<address>
${facts.address ? `<p>${esc(facts.address)}</p>` : `<p>${esc(facts.addressNote)}</p>`}
${facts.phone ? `<p><a href="tel:${esc(facts.phone)}">${esc(facts.phone)}</a></p>` : ''}
${facts.email ? `<p><a href="mailto:${esc(facts.email)}">${esc(facts.email)}</a></p>` : ''}
${facts.hours ? `<p>${esc(facts.hours)}</p>` : `<p>${esc(facts.hoursNote)}</p>`}
</address>
${workingForm(
        formAction,
        `<input type="text" name="name" placeholder="Your name" aria-label="Name" autocomplete="name" required />
<input type="email" name="email" placeholder="you@example.com" aria-label="Email" autocomplete="email" required />
<textarea name="message" rows="4" placeholder="How can we help?" aria-label="Message" required></textarea>`,
        facts.ctaLabel,
    )}
</div>
</section>`;
}

export function settingsPageHtml(composition: Composition): string {
    const facts = finishedContactFacts(contactProps(composition), composition.meta.title || 'This business');
    const title = composition.meta.title || 'This business';
    const formAction = facts.email
        ? `mailto:${facts.email}?subject=${encodeURIComponent(`Settings — ${title}`)}`
        : '#settings-form';
    return `<section id="settings" data-section="settings" data-type="about" data-animate>
<h2>Settings</h2>
<p>Hours, contact, and how this site reaches people. These are the facts this website was built from.</p>
<dl class="settings-list">
<dt>Business</dt><dd>${esc(title)}</dd>
<dt>About</dt><dd>${esc(composition.meta.description || '—')}</dd>
${facts.address ? `<dt>Place</dt><dd>${esc(facts.address)}</dd>` : `<dt>Place</dt><dd>${esc(facts.addressNote)}</dd>`}
${facts.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(facts.phone)}">${esc(facts.phone)}</a></dd>` : '<dt>Phone</dt><dd>Use the form — add a number when you have one</dd>'}
${facts.email ? `<dt>Email</dt><dd><a href="mailto:${esc(facts.email)}">${esc(facts.email)}</a></dd>` : '<dt>Email</dt><dd>Add your email when you are ready</dd>'}
${facts.hours ? `<dt>Hours</dt><dd>${esc(facts.hours)}</dd>` : `<dt>Hours</dt><dd>${esc(facts.hoursNote)}</dd>`}
</dl>
<h3>Message the business</h3>
${workingForm(
        formAction,
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
