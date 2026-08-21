import type { FileMap, SiteMeta } from '@/lib/contracts';
import { escapeHtml } from '@/lib/content/slots';
import { normaliseUpiId, upiPayUri } from './upi';

export const PAY_PAGE_PATH = 'pay.html';

export function mergeSiteMeta(existing: SiteMeta | null | undefined, patch: SiteMeta): SiteMeta {
    return { ...(existing ?? {}), ...patch };
}

export function renderPayPageHtml(opts: {
    businessName: string;
    upiId: string;
    amountInr?: number;
    note?: string;
}): string {
    const name = opts.businessName.trim() || 'This shop';
    const upi = normaliseUpiId(opts.upiId);
    const amount = opts.amountInr && opts.amountInr > 0 ? `Rs ${Math.round(opts.amountInr)}` : null;
    const href = escapeHtml(
        upiPayUri({
            upiId: upi,
            payeeName: name,
            amountInr: opts.amountInr,
            note: opts.note,
        }),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pay ${escapeHtml(name)}</title>
  <style>
    :root {
      --background: #05070a;
      --foreground: #f4f7fb;
      --card: #0b121e;
      --muted: #a8b4c4;
      --gold: #d4b56a;
      --gold-ink: #05070a;
      --bloom-blue: #00a3ff;
      --bloom-amber: #f0a04a;
      --bloom-sky: #5ec8ff;
      --border: #243044;
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; }
    body {
      color: var(--foreground);
      font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
      background:
        radial-gradient(ellipse at 14% 8%, color-mix(in srgb, var(--bloom-blue) 28%, transparent), transparent 46%),
        radial-gradient(ellipse at 88% 14%, color-mix(in srgb, var(--bloom-sky) 18%, transparent), transparent 42%),
        radial-gradient(ellipse at 78% 92%, color-mix(in srgb, var(--bloom-amber) 14%, transparent), transparent 44%),
        linear-gradient(180deg, var(--card) 0%, var(--background) 42%, var(--background) 100%);
    }
    main {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 3rem 1.5rem;
    }
    .panel {
      width: min(100%, 28rem);
      border: 1px solid color-mix(in srgb, var(--bloom-sky) 22%, var(--border));
      border-radius: 1.25rem;
      padding: 2rem 1.75rem;
      background: color-mix(in srgb, var(--card) 72%, transparent);
      backdrop-filter: blur(18px) saturate(1.2);
    }
    .kicker {
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--bloom-sky);
    }
    h1 {
      margin: 0.85rem 0 0;
      font-family: Outfit, ui-sans-serif, system-ui, sans-serif;
      font-size: 2rem;
      letter-spacing: -0.03em;
      line-height: 1.1;
    }
    p { margin: 0.75rem 0 0; color: var(--muted); line-height: 1.6; }
    .upi {
      margin-top: 1.25rem;
      padding: 0.9rem 1rem;
      border-radius: 0.85rem;
      border: 1px solid var(--border);
      background: #121a28;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.95rem;
      word-break: break-all;
    }
    .amount { margin-top: 0.5rem; color: var(--gold); font-weight: 650; }
    .pay {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      margin-top: 1.5rem;
      border-radius: 999px;
      border: 1px solid var(--gold);
      background: var(--gold);
      color: var(--gold-ink);
      font-weight: 650;
      text-decoration: none;
    }
    .back { margin-top: 1rem; color: var(--muted); font-size: 0.9rem; }
  </style>
</head>
<body>
  <main>
    <article class="panel">
      <p class="kicker">PageCrafts</p>
      <h1>Pay ${escapeHtml(name)}</h1>
      <p>This site takes orders. Open your UPI app and send the amount to the ID below.</p>
      ${amount ? `<p class="amount">${escapeHtml(amount)}</p>` : ''}
      <p class="upi">${escapeHtml(upi)}</p>
      <a class="pay" href="${href}">Pay with UPI</a>
      <p class="back"><a href="index.html" style="color:inherit">Back to the site</a></p>
    </article>
  </main>
</body>
</html>
`;
}

const ORDER_CTA = /(order now|place order|add to cart|buy now|checkout|pay now)/i;

export function wireHtmlPayLinks(html: string, href = PAY_PAGE_PATH): string {
    if (!html.trim() || html.includes(`href="${href}"`)) return html;
    const linked = html.replace(
        /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
        (full, attrs: string, label: string) => {
            if (!ORDER_CTA.test(label) && !ORDER_CTA.test(attrs)) return full;
            if (/\bhref\s*=/i.test(attrs)) {
                return `<a${attrs.replace(/\bhref\s*=\s*("[^"]*"|'[^']*')/i, `href="${href}"`)}>${label}</a>`;
            }
            return `<a href="${href}"${attrs}>${label}</a>`;
        },
    );
    if (linked !== html) return linked;
    if (/<\/body>/i.test(html)) {
        return html.replace(
            /<\/body>/i,
            `<p style="position:fixed;right:1rem;bottom:1rem;z-index:20"><a href="${href}" style="display:inline-flex;min-height:44px;align-items:center;padding:0 1.1rem;border-radius:999px;background:#d4b56a;color:#05070a;font-weight:650;text-decoration:none">Pay with UPI</a></p></body>`,
        );
    }
    return `${html}\n<p><a href="${href}">Pay with UPI</a></p>`;
}

export function wireOrderPayments(
    files: FileMap,
    opts: { businessName: string; upiId: string },
): FileMap {
    const upi = normaliseUpiId(opts.upiId);
    if (!upi) return files;
    const next: FileMap = { ...files };
    next[PAY_PAGE_PATH] = renderPayPageHtml({
        businessName: opts.businessName,
        upiId: upi,
    });
    for (const [path, content] of Object.entries(next)) {
        if (!/\.html?$/i.test(path) || path === PAY_PAGE_PATH) continue;
        next[path] = wireHtmlPayLinks(content);
    }
    return next;
}
