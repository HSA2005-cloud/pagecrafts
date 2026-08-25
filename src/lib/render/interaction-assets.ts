/**
 * The Rs 999 layer: a page that answers the cursor.
 *
 * Everything here is CSS transforms and about forty lines of vanilla JavaScript, inlined
 * into the one self-contained HTML file a published site already is. No Three.js, no CDN,
 * no build step -- a published site has a 50-file cap and no bundler, and a paid page whose
 * effects depend on a script that might 404 is worse than a paid page with none.
 *
 * Every kit is off under prefers-reduced-motion. Motion that ignores that setting is not a
 * premium feature, it is an accessibility fault somebody paid for.
 */

export const INTERACTION_IDS = [
    'tilt',
    'spotlight',
    'magnetic',
    'parallax',
    'depth',
    'float',
] as const;

export type InteractionId = (typeof INTERACTION_IDS)[number];

const CSS: Record<InteractionId, string> = {
    tilt: `
[data-fx~="tilt"] .card, [data-fx~="tilt"] [data-type="services"] li {
  transform: perspective(900px) rotateX(var(--tx, 0deg)) rotateY(var(--ty, 0deg)) translateZ(0);
  transition: transform .35s cubic-bezier(.22,.61,.36,1), box-shadow .35s ease;
  will-change: transform;
}
[data-fx~="tilt"] .card:hover, [data-fx~="tilt"] [data-type="services"] li:hover {
  box-shadow: 0 22px 60px rgba(0,0,0,0.35);
}`,
    spotlight: `
[data-fx~="spotlight"] [data-type="hero"]::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  opacity: var(--sl-on, 0);
  transition: opacity .4s ease;
  background: radial-gradient(
    32rem circle at var(--sl-x, 50%) var(--sl-y, 40%),
    color-mix(in srgb, var(--accent, #fff) 26%, transparent),
    transparent 70%
  );
}`,
    magnetic: `
[data-fx~="magnetic"] .cta {
  transform: translate3d(var(--mx, 0px), var(--my, 0px), 0);
  transition: transform .28s cubic-bezier(.22,.61,.36,1);
  will-change: transform;
}`,
    parallax: `
[data-fx~="parallax"] [data-type="hero"] .img-slot {
  transform: translate3d(var(--px, 0px), var(--py, 0px), 0) scale(1.08);
  transition: transform .5s cubic-bezier(.22,.61,.36,1);
  will-change: transform;
}
[data-fx~="parallax"] [data-type="hero"] .hero-copy {
  transform: translate3d(calc(var(--px, 0px) * -0.35), calc(var(--py, 0px) * -0.35), 0);
  transition: transform .5s cubic-bezier(.22,.61,.36,1);
}`,
    depth: `
[data-fx~="depth"] section {
  perspective: 1200px;
}
[data-fx~="depth"] section > * {
  transform: translate3d(0, var(--dz, 24px), 0) rotateX(var(--dr, 3deg));
  opacity: var(--do, 0);
  transition: transform .9s cubic-bezier(.22,.61,.36,1), opacity .9s ease;
}
[data-fx~="depth"] section.in-view > * {
  --dz: 0px;
  --dr: 0deg;
  --do: 1;
}`,
    float: `
@keyframes pc-fx-float {
  from { transform: translate3d(0, -8px, 0); }
  to { transform: translate3d(0, 8px, 0); }
}
[data-fx~="float"] [data-type="hero"] .motion-motif,
[data-fx~="float"] [data-type="hero"] .img-slot img {
  animation: pc-fx-float 6s ease-in-out infinite alternate;
}`,
};

/** Cursor work is one rAF for the whole page, not one listener per element. */
const JS: Record<InteractionId, string> = {
    tilt: `
  on('tilt', function (root) {
    var cards = root.querySelectorAll('.card, [data-type="services"] li');
    if (!cards.length) return;
    cards.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--ty', (px * 9).toFixed(2) + 'deg');
        card.style.setProperty('--tx', (-py * 9).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--tx', '0deg');
        card.style.setProperty('--ty', '0deg');
      });
    });
  });`,
    spotlight: `
  on('spotlight', function (root) {
    var hero = root.querySelector('[data-type="hero"]');
    if (!hero) return;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      hero.style.setProperty('--sl-x', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
      hero.style.setProperty('--sl-y', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
      hero.style.setProperty('--sl-on', '1');
    });
    hero.addEventListener('pointerleave', function () {
      hero.style.setProperty('--sl-on', '0');
    });
  });`,
    magnetic: `
  on('magnetic', function (root) {
    root.querySelectorAll('.cta').forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * 0.28).toFixed(1) + 'px');
        btn.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1) + 'px');
      });
      btn.addEventListener('pointerleave', function () {
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      });
    });
  });`,
    parallax: `
  on('parallax', function (root) {
    var hero = root.querySelector('[data-type="hero"]');
    if (!hero) return;
    var queued = false, mx = 0, my = 0;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 26;
      my = ((e.clientY - r.top) / r.height - 0.5) * 18;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        hero.style.setProperty('--px', mx.toFixed(1) + 'px');
        hero.style.setProperty('--py', my.toFixed(1) + 'px');
      });
    });
    hero.addEventListener('pointerleave', function () {
      hero.style.setProperty('--px', '0px');
      hero.style.setProperty('--py', '0px');
    });
  });`,
    depth: `
  on('depth', function (root) {
    var sections = root.querySelectorAll('section');
    if (!sections.length || !('IntersectionObserver' in window)) {
      sections.forEach(function (s) { s.classList.add('in-view'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    sections.forEach(function (s) { io.observe(s); });
  });`,
    float: '',
};

export function interactionCss(kit: readonly InteractionId[]): string {
    if (kit.length === 0) return '';

    return [
        `@media (prefers-reduced-motion: reduce) {
  [data-fx] .card, [data-fx] [data-type="services"] li,
  [data-fx] .cta, [data-fx] [data-type="hero"] .img-slot,
  [data-fx] [data-type="hero"] .hero-copy, [data-fx] section > * {
    transform: none !important;
    animation: none !important;
    opacity: 1 !important;
    transition: none !important;
  }
  [data-fx] [data-type="hero"]::before { opacity: 0 !important; }
}`,
        ...kit.map((id) => CSS[id]),
    ].join('\n');
}

export function interactionJs(kit: readonly InteractionId[]): string {
    const bodies = kit.map((id) => JS[id]).filter(Boolean);
    if (bodies.length === 0) return '';

    // Reduced motion is checked once, at the top: the listeners are never attached rather
    // than attached and then told to do nothing.
    return `(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('section').forEach(function (s) { s.classList.add('in-view'); });
    return;
  }
  var root = document.body;
  if (!root) return;
  function on(id, run) {
    if (!(' ' + (root.getAttribute('data-fx') || '') + ' ').includes(' ' + id + ' ')) return;
    try { run(root); } catch (e) { /* one effect failing must not take the page with it */ }
  }
${bodies.join('\n')}
})();`;
}
