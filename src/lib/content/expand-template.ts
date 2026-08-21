import type { ContentSchema, FileMap } from "@/lib/contracts";
import type { TemplateFacts } from "@/lib/content/personalise";

/**
 * Turn a one-page template fork into a working site without generating a new look.
 *
 * The homepage, stylesheet and section structure stay. About, Contact and Settings are
 * added in the same chrome, and the nav points at those files so the design is a site,
 * not a single scroll.
 */

export const TEMPLATE_SITE_PAGES = [
    { path: "index.html", label: "Home", key: null },
    { path: "about.html", label: "About", key: "aboutPage" },
    { path: "contact.html", label: "Contact", key: "contactPage" },
    { path: "settings.html", label: "Settings", key: "settingsPage" },
] as const;

const EXTRA_CSS = `
.contact-grid { display: grid; gap: 2rem; grid-template-columns: 1fr 1.2fr; align-items: start; margin-top: 1.75rem; }
.contact-grid address { font-style: normal; color: var(--muted); }
.contact-grid address p { margin: 0 0 0.5rem; }
.form textarea {
  width: 100%;
  min-height: 7rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--rule);
  border-radius: 0.5rem;
  background: var(--panel);
  color: var(--ink);
  font: inherit;
}
.settings-list { display: grid; gap: 0.75rem 1.25rem; grid-template-columns: 8rem 1fr; margin: 1.5rem 0 0; }
.settings-list dt { margin: 0; color: var(--muted); font-size: 0.8125rem; }
.settings-list dd { margin: 0; }
@media (max-width: 48rem) {
  .contact-grid { grid-template-columns: 1fr; }
  .settings-list { grid-template-columns: 1fr; }
}
`;

function clean(value: string | undefined): string {
    return (value ?? "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function textOf(inner: string): string {
    return inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function hrefFor(path: string, current: string): string {
    return path === current ? "#top" : path;
}

function navInnerFrom(html: string): string {
    const nav = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/i)?.[0] ?? "";
    return nav.replace(/^<nav\b[^>]*>/i, "").replace(/<\/nav>$/i, "");
}

function rewriteNavInner(originalInner: string, currentPath: string): string {
    const links: { href: string; label: string }[] = [];
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    for (const match of originalInner.matchAll(re)) {
        const href = match[1]?.match(/\bhref="([^"]*)"/i)?.[1] ?? "#";
        const label = textOf(match[2] ?? "");
        if (label) links.push({ href, label });
    }

    const seen = new Set<string>();
    const out: string[] = [];

    const add = (href: string, label: string) => {
        const key = label.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const current = href === "#top" || href === currentPath;
        out.push(
            `        <a href="${escapeHtml(href)}"${current ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`,
        );
    };

    add(hrefFor("index.html", currentPath), "Home");

    for (const link of links) {
        const required = TEMPLATE_SITE_PAGES.find(
            (page) => page.label.toLowerCase() === link.label.toLowerCase(),
        );
        if (required) {
            add(hrefFor(required.path, currentPath), required.label);
            continue;
        }
        if (link.label.toLowerCase() === "home") continue;
        let href = link.href;
        if (href.startsWith("#") && currentPath !== "index.html") {
            href = `index.html${href}`;
        }
        add(href, link.label);
    }

    for (const page of TEMPLATE_SITE_PAGES) {
        if (page.path === "index.html") continue;
        add(hrefFor(page.path, currentPath), page.label);
    }

    return `\n${out.join("\n")}\n      `;
}

function withNav(header: string, navInner: string): string {
    if (/<nav\b/i.test(header)) {
        return header.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/i, `<nav class="nav">${navInner}</nav>`);
    }
    if (/<\/aside>/i.test(header)) {
        return header.replace(/<\/aside>/i, `      <nav class="nav">${navInner}</nav>\n    </aside>`);
    }
    return header.replace(/<\/header>/i, `      <nav class="nav">${navInner}</nav>\n    </header>`);
}

function extractChrome(indexHtml: string, name: string) {
    const head = indexHtml.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)?.[0]
        ?? `<head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <link rel="stylesheet" href="styles.css" />\n  </head>`;
    const headerMatch =
        indexHtml.match(/<aside\b[^>]*class="[^"]*site-sidebar[^"]*"[^>]*>[\s\S]*?<\/aside>/i)?.[0]
        ?? indexHtml.match(/<header\b[^>]*>[\s\S]*?<\/header>/i)?.[0];
    const footer = indexHtml.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/i)?.[0]
        ?? `    <footer class="footer">\n      <p data-slot="site.footer">${escapeHtml(name)}</p>\n    </footer>`;
    const htmlOpen = indexHtml.match(/<html\b[^>]*>/i)?.[0] ?? "<html lang=\"en\">";
    const bodyOpen = indexHtml.match(/<body\b[^>]*>/i)?.[0] ?? "<body>";
    const header = headerMatch
        ?? `    <header class="site-topbar site-topbar-blend">\n      <a class="wordmark" href="index.html" data-slot="site.name">${escapeHtml(name)}</a>\n      <nav class="nav"></nav>\n    </header>`;

    return { head, header, footer, htmlOpen, bodyOpen };
}

function titledHead(head: string, title: string): string {
    if (/<title>/i.test(head)) {
        return head.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    }
    return head.replace(/<\/head>/i, `    <title>${escapeHtml(title)}</title>\n  </head>`);
}

function pageDocument(
    chrome: ReturnType<typeof extractChrome>,
    navInner: string,
    title: string,
    body: string,
): string {
    return `<!doctype html>
${chrome.htmlOpen}
  ${titledHead(chrome.head, title)}
  ${chrome.bodyOpen}
${withNav(chrome.header, navInner)}
${body}
${chrome.footer}
  </body>
</html>`;
}

function stampSlot(html: string, slot: string, value: string): string {
    if (!value) return html;
    const re = new RegExp(
        `(<([a-z0-9]+)\\b[^>]*\\bdata-slot="${slot}"[^>]*>)([\\s\\S]*?)(<\\/\\2>)`,
        "i",
    );
    return html.replace(re, `$1${escapeHtml(value)}$4`);
}

function extraPageBody(facts: TemplateFacts, key: string): string {
    const name = clean(facts.name);
    const offer = clean(facts.offer);
    const place = clean(facts.place);
    const phone = clean(facts.phone);
    const hours = clean(facts.hours);
    const extra = clean(facts.extra);
    const where = place ? `${offer} in ${place}` : offer;

    if (key === "aboutPage") {
        const body = extra ? `${where}. ${extra}` : `${where}.`;
        return `    <section class="section" id="about">
      <h2 data-slot="aboutPage.heading">About ${escapeHtml(name)}</h2>
      <p data-slot="aboutPage.body">${escapeHtml(body)}</p>
    </section>`;
    }

    if (key === "contactPage") {
        return `    <section class="section" id="contact">
      <h2 data-slot="contactPage.heading">Contact</h2>
      <p data-slot="contactPage.body">Reach ${escapeHtml(name)}${place ? ` in ${escapeHtml(place)}` : ""}.</p>
      <div class="contact-grid">
        <address>
${place ? `          <p data-slot="contactPage.place">${escapeHtml(place)}</p>\n` : ""}${phone ? `          <p><a href="tel:${escapeHtml(phone)}" data-slot="contactPage.phone">${escapeHtml(phone)}</a></p>\n` : ""}${hours ? `          <p data-slot="contactPage.hours">${escapeHtml(hours)}</p>\n` : ""}        </address>
        <form class="form" action="" method="post">
          <input type="text" name="name" placeholder="Your name" aria-label="Name" autocomplete="name" required />
          <input type="email" name="email" placeholder="you@example.com" aria-label="Email" autocomplete="email" required />
          <textarea name="message" rows="4" placeholder="How can we help?" aria-label="Message" required></textarea>
          <button type="submit">Send</button>
        </form>
      </div>
    </section>`;
    }

    return `    <section class="section" id="settings">
      <h2 data-slot="settingsPage.heading">Settings</h2>
      <p data-slot="settingsPage.body">Hours, contact, and how this site reaches people.</p>
      <dl class="settings-list">
        <dt>Business</dt><dd data-slot="settingsPage.name">${escapeHtml(name)}</dd>
        <dt>About</dt><dd data-slot="settingsPage.offer">${escapeHtml(where)}</dd>
${place ? `        <dt>Place</dt><dd>${escapeHtml(place)}</dd>\n` : ""}${phone ? `        <dt>Phone</dt><dd><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></dd>\n` : ""}${hours ? `        <dt>Hours</dt><dd>${escapeHtml(hours)}</dd>\n` : ""}      </dl>
      <h3>Message the business</h3>
      <form class="form" action="" method="post">
        <input type="text" name="name" placeholder="Your name" aria-label="Name" autocomplete="name" required />
        <input type="email" name="email" placeholder="you@example.com" aria-label="Email" autocomplete="email" required />
        <textarea name="message" rows="4" placeholder="A note about hours, contact, or this site" aria-label="Message" required></textarea>
        <button type="submit">Send</button>
      </form>
    </section>`;
}

function extraSchema(): ContentSchema["sections"] {
    return [
        {
            key: "aboutPage",
            label: "About page",
            fields: [
                { key: "heading", label: "Heading", type: "text", maxLength: 60 },
                { key: "body", label: "Body", type: "richtext" },
            ],
        },
        {
            key: "contactPage",
            label: "Contact page",
            fields: [
                { key: "heading", label: "Heading", type: "text", maxLength: 60 },
                { key: "body", label: "Body", type: "richtext" },
                { key: "place", label: "Place", type: "text", maxLength: 80, optional: true },
                { key: "phone", label: "Phone", type: "text", maxLength: 20, optional: true },
                { key: "hours", label: "Hours", type: "text", maxLength: 80, optional: true },
            ],
        },
        {
            key: "settingsPage",
            label: "Settings page",
            fields: [
                { key: "heading", label: "Heading", type: "text", maxLength: 60 },
                { key: "body", label: "Body", type: "richtext" },
                { key: "name", label: "Business", type: "text", maxLength: 80 },
                { key: "offer", label: "About", type: "text", maxLength: 200 },
            ],
        },
    ];
}

export function expandTemplateSite(
    files: FileMap,
    schema: ContentSchema,
    facts: TemplateFacts,
): { files: FileMap; schema: ContentSchema } {
    const index = files["index.html"];
    if (!index) return { files, schema };

    const name = clean(facts.name) || "Home";
    const chrome = extractChrome(index, name);
    chrome.header = stampSlot(chrome.header, "site.name", name);
    chrome.footer = stampSlot(
        chrome.footer,
        "site.footer",
        clean(facts.place) ? `${name} · ${clean(facts.place)}` : name,
    );
    const originalNav = navInnerFrom(index);
    const next: FileMap = { ...files };

    next["index.html"] = pageDocument(
        chrome,
        rewriteNavInner(originalNav, "index.html"),
        name,
        bodyOf(index),
    );

    for (const page of TEMPLATE_SITE_PAGES) {
        if (!page.key) continue;
        if (next[page.path]) continue;
        next[page.path] = pageDocument(
            chrome,
            rewriteNavInner(originalNav, page.path),
            `${name} — ${page.label}`,
            extraPageBody(facts, page.key),
        );
    }

    const css = next["styles.css"] ?? "";
    if (css && !css.includes(".contact-grid")) {
        next["styles.css"] = `${css.trimEnd()}\n${EXTRA_CSS}`;
    }

    const known = new Set(schema.sections.map((section) => section.key));
    const added = extraSchema().filter((section) => !known.has(section.key));

    return {
        files: next,
        schema: added.length ? { sections: [...schema.sections, ...added] } : schema,
    };
}

function bodyOf(indexHtml: string): string {
    const withoutChrome = indexHtml
        .replace(/<!doctype[^>]*>/i, "")
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, "")
        .replace(/<header\b[^>]*>[\s\S]*?<\/header>/i, "")
        .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/i, "");
    const body = withoutChrome.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
    if (body !== undefined) return body.trim();
    return withoutChrome.replace(/<\/?(html|body)\b[^>]*>/gi, "").trim();
}
