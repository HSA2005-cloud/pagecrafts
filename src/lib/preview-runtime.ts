/**
 * Preview documents run in a unique-origin sandboxed iframe (blob: URL,
 * allow-scripts, no allow-same-origin). Chromium treats in-page hash clicks
 * as a navigation the sandbox cannot complete, so nav, CTAs and other
 * <a href="#…"> controls look dead. Forms need allow-forms or submit is
 * blocked, but an empty action would then navigate the blob URL away.
 *
 * This bootstrap is injected into every assembled preview. It does not change
 * template markup. It never grants same-origin access to the editor.
 */

export type PreviewSectionHint = {
    id: string;
    heading?: string;
    slotPrefix?: string;
    type?: string;
};

export function tokenize(value: string): string[] {
    return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Resolve a hash / link label to a section id without a live DOM. */
export function matchPreviewSection(
    sections: PreviewSectionHint[],
    hashId: string,
    linkText = '',
): string | null {
    const id = hashId.replace(/^#/, '').trim();
    if (!id) return '';
    const exact = sections.find((section) => section.id === id);
    if (exact) return exact.id;
    const byName = sections.find(
        (section) => section.slotPrefix === id || section.type === id,
    );
    if (byName) return byName.id;
    const want = tokenize(linkText || id);
    if (want.length === 0) return null;
    const hit = sections.find((section) => {
        const have = new Set(tokenize(`${section.id} ${section.heading ?? ''}`));
        return want.every((token) => have.has(token));
    });
    return hit?.id ?? null;
}

/**
 * Runs inside the iframe. Keep this as plain ES5-ish JS: no imports, no JSX.
 * Template scripts still receive the original events (we do not stopPropagation
 * except on decorative search controls we synthesize).
 */
export const PREVIEW_BOOTSTRAP_JS = `(function () {
  function send(msg) {
    try { parent.postMessage({ __pagecraft: true, message: String(msg) }, '*'); } catch (e) {}
  }
  window.addEventListener('error', function (e) { send(e.message); });
  window.addEventListener('unhandledrejection', function (e) { send(e.reason); });

  function tokens(value) {
    return String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }
  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_\\-]/g, function (ch) { return '\\\\' + ch; });
  }
  function asElement(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement;
  }
  function prefersReduced() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }
  function resolveTarget(hash, linkText) {
    var id = String(hash || '').replace(/^#/, '').trim();
    if (!id) return document.documentElement;
    var el = document.getElementById(id);
    if (el) return el;
    try {
      el = document.querySelector('[name="' + cssEscape(id) + '"]');
      if (el) return el;
    } catch (err) {}
    try {
      el = document.querySelector('[data-slot^="' + cssEscape(id) + '."]');
      if (el) return el.closest('section') || el;
    } catch (err) {}
    try {
      el = document.querySelector('[data-section="' + cssEscape(id) + '"], [data-type="' + cssEscape(id) + '"]');
      if (el) return el;
    } catch (err) {}
    var want = tokens(linkText || id);
    if (!want.length) return null;
    var nodes = document.querySelectorAll('section, [id], h1, h2, h3, h4, h5, h6');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var heading = '';
      if (/^H[1-6]$/.test(node.tagName)) heading = node.textContent || '';
      else {
        var h = node.querySelector('h1, h2, h3, h4, h5, h6');
        heading = (h && h.textContent) || '';
      }
      var have = tokens((node.id || '') + ' ' + heading);
      var ok = true;
      for (var j = 0; j < want.length; j++) {
        if (have.indexOf(want[j]) === -1) { ok = false; break; }
      }
      if (ok) return node.closest ? (node.closest('section') || node) : node;
    }
    return null;
  }
  function scrollToTarget(target) {
    if (!target || !target.scrollIntoView) return;
    target.scrollIntoView({
      block: 'start',
      behavior: prefersReduced() ? 'auto' : 'smooth'
    });
  }
  function isRealControl(node) {
    return !!(node && node.closest && node.closest('a[href], button, input, textarea, select, summary, label, form'));
  }
  function searchControl(start) {
    var node = asElement(start);
    while (node && node !== document && node !== document.documentElement) {
      if (isRealControl(node)) return null;
      var label = (node.getAttribute && (node.getAttribute('aria-label') || '')) || '';
      var cls = node.classList;
      if (/search/i.test(label) || (cls && (cls.contains('search') || cls.contains('nav-search')))) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }
  function existingSearchField() {
    return document.querySelector('input[type="search"], input[name="q"], input[name="query"], input[name="s"]');
  }
  function toggleFind() {
    var field = existingSearchField();
    if (field) { field.focus(); return; }
    var bar = document.getElementById('pagecraft-preview-find');
    if (bar) { bar.remove(); return; }
    bar = document.createElement('form');
    bar.id = 'pagecraft-preview-find';
    bar.setAttribute('role', 'search');
    bar.style.cssText = 'position:fixed;top:0.75rem;right:0.75rem;z-index:2147483647;display:flex;gap:0.4rem;padding:0.4rem 0.5rem;background:#fff;color:#171717;border:1px solid #d4d4d8;border-radius:0.5rem;box-shadow:0 8px 24px rgba(0,0,0,.12);font:14px system-ui,sans-serif';
    var input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Find on page';
    input.setAttribute('aria-label', 'Find on page');
    input.style.cssText = 'border:0;outline:none;min-width:10rem;font:inherit';
    bar.appendChild(input);
    bar.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var q = input.value;
      if (!q) return;
      if (typeof window.find === 'function') window.find(q);
    });
    (document.body || document.documentElement).appendChild(bar);
    input.focus();
  }
  function onClick(e) {
    var el = asElement(e.target);
    if (!el) return;
    var search = searchControl(el);
    if (search) {
      e.preventDefault();
      e.stopPropagation();
      toggleFind();
      return;
    }
    var a = el.closest ? el.closest('a') : null;
    if (!a) return;
    var raw = a.getAttribute('href');
    if (raw == null || String(raw).trim() === '') {
      e.preventDefault();
      return;
    }
    var href = String(raw).trim();
    if (href.charAt(0) === '#') {
      e.preventDefault();
      scrollToTarget(resolveTarget(href, (a.textContent || '').trim()));
      return;
    }
    if (/^(javascript|mailto|tel):/i.test(href)) return;
    var path = href.split('?')[0].split('#')[0].replace(/^\\.\\//, '').replace(/^\\//, '');
    if (/\\.html?$/i.test(path) && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      e.preventDefault();
      try { parent.postMessage({ __pagecraft: true, kind: 'navigate', path: path }, '*'); } catch (err) {}
      return;
    }
    e.preventDefault();
  }
  function onSubmit(e) {
    e.preventDefault();
    var form = e.target;
    if (!form || !form.querySelector) return;
    var status = form.querySelector('.form-status');
    if (status) {
      status.hidden = false;
      status.textContent = 'Thanks — we got your message.';
    }
  }
  try {
    HTMLFormElement.prototype.submit = function () {};
  } catch (err) {}
  document.addEventListener('click', onClick, true);
  document.addEventListener('submit', onSubmit, true);
  var style = document.createElement('style');
  style.setAttribute('data-pagecraft-preview', 'interactions');
  style.textContent = '.search,[aria-label="Search" i]{cursor:pointer}';
  (document.head || document.documentElement).appendChild(style);
})();`;

export const PREVIEW_BOOTSTRAP_SCRIPT = `<script>\n${PREVIEW_BOOTSTRAP_JS}\n</script>`;
