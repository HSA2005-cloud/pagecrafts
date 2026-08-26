/**
 * Fixed restaurant demos for Compare — rendered through the real Casual /
 * Photo-rich / Animated generators (`compositionToFiles`), not hand-drawn chrome.
 */

import { SCHEMA_VERSION, type Composition, type SectionInstance } from "@/lib/contracts";
import { applyStyle, STYLE_SPECS, type StyleId } from "@/lib/ai/generate/styles";
import { compositionToFiles } from "@/lib/ai/generate/to-files";

export type CompareLookId = "starter" | "pro" | "premium";

export const DEMO_BRAND = {
    name: "1522 Hotel",
    place: "Bengaluru",
    tagline: "Fine dining in Bengaluru.",
    domain: "1522hotel.in",
} as const;

const STYLE_BY_LOOK: Record<CompareLookId, StyleId> = {
    starter: "casual",
    pro: "photos",
    premium: "motion",
};

const HERO =
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=70&auto=format&fit=crop";
const ROOM =
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=70&auto=format&fit=crop";
/** Compare gallery — local fine-dining photos shown on Free, Pro, and Premium. */
const GALLERY_DINING_HALL = "/compare-gallery/dining-hall.jpg";
const GALLERY_GRAND_SALON = "/compare-gallery/grand-salon.jpg";
const GALLERY_CRYSTAL_ROOM = "/compare-gallery/crystal-room.jpg";

export const COMPARE_LOOKS: {
    id: CompareLookId;
    styleId: StyleId;
    /** Product name shown on Compare (Starter / Pro / Premium). */
    label: string;
    /** Generator look name (Casual / Photo-rich / Animated). */
    lookName: string;
    priceInr: number;
    pages: string[];
    features: string[];
    blurb: string;
}[] = [
    {
        id: "starter",
        styleId: "casual",
        label: "Starter",
        lookName: STYLE_SPECS.casual.label,
        priceInr: STYLE_SPECS.casual.priceInr,
        pages: ["Home", "About", "Services", "Contact", "Settings"],
        features: [
            "Centre-oriented layout that fills the screen",
            "One hero photograph",
            "Clean multi-page site",
            "Free to use",
        ],
        blurb: "A centred, finished website — clear words, one photo, nothing stuck at the top.",
    },
    {
        id: "pro",
        styleId: "photos",
        label: "Pro",
        lookName: STYLE_SPECS.photos.label,
        priceInr: STYLE_SPECS.photos.priceInr,
        pages: ["Home", "About", "Menu", "Gallery", "Contact", "Settings"],
        features: [
            "Topic photograph as a full-site backdrop",
            "Subtle photo parallax and soft card zoom",
            "Editorial type and cinematic hero",
            "Smooth fade between pages",
            "Pro · Rs 499",
        ],
        blurb: "Photographic and editorial — the room fills the page, with soft parallax and page fades as you move.",
    },
    {
        id: "premium",
        styleId: "motion",
        label: "Premium",
        lookName: STYLE_SPECS.motion.label,
        priceInr: STYLE_SPECS.motion.priceInr,
        pages: ["Continuous Home deck", "About", "Services", "FAQ", "Contact", "Settings"],
        features: [
            "Continuous scroll like pagecrafts.in",
            "Full-viewport liquid slides",
            "Kinetic canvas, motif, and ticker",
            "Premium · Rs 999",
        ],
        blurb: "A continuous-scroll site — one flowing deck, hash navigation, motion drawn from the business.",
    },
];

function section(
    id: string,
    type: SectionInstance["type"],
    variant: string,
    props: Record<string, unknown>,
): SectionInstance {
    return {
        id,
        type,
        variant,
        brief: "demo",
        visible: true,
        locked: false,
        source: "ai",
        props,
    };
}

/** Same brief shaped as a restaurant — three looks via applyStyle + compositionToFiles. */
export function demoRestaurantComposition(): Composition {
    return {
        schemaVersion: SCHEMA_VERSION,
        vertical: "restaurant",
        artDirection: {
            themeId: "sunlit-craft",
            motionId: "none",
            radiusId: "soft",
            spacingId: "default",
            imageryId: "bright-clean",
        },
        meta: {
            title: `${DEMO_BRAND.name} – Fine Dining in ${DEMO_BRAND.place}`,
            description: DEMO_BRAND.tagline,
            lang: "en",
        },
        sections: [
            section("s_hero", "hero", "centred", {
                eyebrow: DEMO_BRAND.place,
                heading: `${DEMO_BRAND.name} – Fine Dining in ${DEMO_BRAND.place}`,
                sub: "Tables by the glass, plates from the kitchen, reservations every evening.",
                ctaLabel: "Reserve a table",
                image: { url: HERO, query: "fine dining restaurant", alt: "Dining table" },
            }),
            section("s_about", "about", "text", {
                heading: "Our house",
                body: "An evening restaurant in Bengaluru — seafood, wine, and a room that stays late.",
                image: { url: ROOM, query: "restaurant dining room", alt: "Dining room" },
            }),
            section("s_services", "services", "cards", {
                heading: "On the table",
                items: [
                    { title: "Tonight's tasting", body: "Five courses, kitchen's call." },
                    { title: "Private dining", body: "A room for twelve." },
                    { title: "Wine list", body: "Old world and new." },
                ],
            }),
            section("s_menu", "menu", "simple", {
                heading: "Menu",
                items: [
                    { name: "Catch of the day", price: "₹1,200", description: "Grilled, lemon butter." },
                    { name: "House pasta", price: "₹890", description: "Seasonal sauce." },
                    { name: "Chocolate pot", price: "₹420", description: "Sea salt." },
                ],
            }),
            section("s_gallery", "gallery", "masonry", {
                heading: "From the room",
                images: [
                    {
                        url: GALLERY_DINING_HALL,
                        query: "luxury dining hall",
                        alt: "Bright dining hall",
                    },
                    {
                        url: GALLERY_GRAND_SALON,
                        query: "grand restaurant salon",
                        alt: "Grand salon",
                    },
                    {
                        url: GALLERY_CRYSTAL_ROOM,
                        query: "crystal chandelier dining room",
                        alt: "Crystal room",
                    },
                ],
            }),
            section("s_faq", "faq", "accordion", {
                heading: "Before you visit",
                items: [
                    { q: "Do you take walk-ins?", a: "We prefer a reservation after 7." },
                    { q: "Dress code?", a: "Smart casual." },
                ],
            }),
            section("s_contact", "contact", "simple", {
                heading: "Reserve",
                blurb: "Book a table — we reply the same evening.",
                phone: "+91 80 4000 1522",
                email: "book@1522hotel.in",
                hours: "Tue–Sun · 6:30pm – 11:30pm",
                address: "1522, Indiranagar, Bengaluru",
                ctaLabel: "Send message",
            }),
            section("s_footer", "footer", "simple", {
                tagline: `${DEMO_BRAND.name} · ${DEMO_BRAND.place}`,
            }),
        ],
    };
}

/**
 * Compact CSS so 100dvh Premium slides and Pro heroes still read inside the
 * compare card / live frame without drowning in empty viewport.
 */
const COMPARE_FRAME_CSS = `
<style data-pagecrafts-compare>
  [data-type="hero"],
  [data-variant="image-bg"],
  .liquid-slide,
  section.liquid-slide {
    min-height: 28rem !important;
  }
  [data-style="casual"] main {
    min-height: 0 !important;
  }
  [data-style="casual"] [data-type="hero"] {
    min-height: 22rem !important;
  }
  /* Free used to hide gallery photos — Compare must show the real pictures. */
  [data-style="casual"] [data-type="gallery"] .img-slot {
    display: block !important;
  }
  [data-style="casual"] [data-type="gallery"] .img-slot img {
    display: block !important;
    width: 100%;
    min-height: 12rem;
    object-fit: cover;
  }
  [data-type="gallery"] .gallery {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 1rem;
  }
  [data-type="gallery"] figure {
    margin: 0;
  }
  [data-type="gallery"] figcaption {
    margin-top: 0.4rem;
    font-size: 0.9rem;
    color: var(--muted, #666);
  }
</style>
`;

/** Stamp url onto every image prop the demo (or applyStyle) left as src-only. */
function ensureImageUrls(composition: Composition): Composition {
    const next = structuredClone(composition);
    for (const sec of next.sections) {
        const image = sec.props.image;
        if (image && typeof image === "object" && !Array.isArray(image)) {
            const row = image as Record<string, unknown>;
            if (typeof row.url !== "string" || !row.url) {
                const src = typeof row.src === "string" ? row.src : "";
                row.url = src || HERO;
            }
        }
        const images = sec.props.images;
        if (Array.isArray(images)) {
            for (const frame of images) {
                if (!frame || typeof frame !== "object") continue;
                const row = frame as Record<string, unknown>;
                if (typeof row.url !== "string" || !row.url) {
                    const src = typeof row.src === "string" ? row.src : "";
                    row.url = src || GALLERY_DINING_HALL;
                }
            }
        }
    }
    return next;
}

export type CompareNavPage = {
    path: string;
    label: string;
    /** Same-document hash for Premium continuous decks (e.g. #about). */
    href?: string;
};

function labelForPath(path: string): string {
    if (path === "index.html") return "Home";
    if (path === "faq.html") return "FAQ";
    const base = path.replace(/\.html$/i, "");
    return base.charAt(0).toUpperCase() + base.slice(1);
}

function demoFiles(look: CompareLookId): Record<string, string> {
    const styleId = STYLE_BY_LOOK[look];
    const styled = ensureImageUrls(applyStyle(demoRestaurantComposition(), STYLE_SPECS[styleId]));
    const files = compositionToFiles(styled, styleId);
    const html: Record<string, string> = {};
    for (const [path, body] of Object.entries(files)) {
        if (path.endsWith(".html") && typeof body === "string") html[path] = body;
    }
    return html;
}

/**
 * Shell srcDoc that keeps every AI-generated HTML page inside the Compare iframe.
 *
 * Clicking `about.html` in a lone index srcDoc navigates to pagecrafts.in/about.html
 * and Chrome shows "refused to connect". This shell patches .html links and swaps
 * the inner frame to the matching generated file instead.
 */
function multipagePreviewSrcDoc(
    pages: Record<string, string>,
    startPath: string,
): string {
    const payload = JSON.stringify(pages).replace(/</g, "\\u003c");
    const start = pages[startPath] ? startPath : "index.html";
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Compare preview</title>
<style>
  html, body { margin: 0; height: 100%; background: #fff; }
  #pc-view { display: block; width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<iframe id="pc-view" title="Site preview"></iframe>
<script>
(function () {
  var PAGES = ${payload};
  var FRAME_CSS = ${JSON.stringify(COMPARE_FRAME_CSS)};
  var view = document.getElementById("pc-view");

  function fileFromHref(href) {
    try {
      var u = new URL(href, "https://compare.local/index.html");
      var path = (u.pathname || "/").replace(/^\\//, "");
      if (!path || path.endsWith("/")) path += "index.html";
      return { path: path, hash: u.hash ? u.hash.slice(1) : "" };
    } catch (e) {
      return null;
    }
  }

  function patch(raw) {
    var html = String(raw || "");
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, function (open) { return open + FRAME_CSS; });
    } else {
      html = FRAME_CSS + html;
    }
    html = html.replace(/\\bhref\\s*=\\s*(["'])([^"']+?\\.html[^"']*)\\1/gi, function (_, q, href) {
      var nav = fileFromHref(href);
      if (!nav || !PAGES[nav.path]) return "href=" + q + href + q;
      var spec = nav.path + (nav.hash ? "#" + nav.hash : "");
      return "href=" + q + "#" + q + " data-pc-file=" + q + spec + q;
    });
    var bridge = "<script>(function(){document.addEventListener('click',function(e){var t=e.target;if(t&&t.nodeType===3)t=t.parentElement;var a=t&&t.closest&&t.closest('a[data-pc-file]');if(!a)return;e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();var spec=a.getAttribute('data-pc-file')||'index.html';var i=spec.indexOf('#');var path=i<0?spec:spec.slice(0,i);var hash=i<0?'':spec.slice(i+1);parent.postMessage({type:'pc-compare-go',path:path,hash:hash},'*');},true);})();<\\/script>";
    if (/<\\/body>/i.test(html)) return html.replace(/<\\/body>/i, bridge + "</body>");
    return html + bridge;
  }

  var current = { path: "", hash: "" };
  function go(path, hash) {
    var key = path && PAGES[path] ? path : "index.html";
    var h = hash || "";
    if (current.path === key && current.hash === h && view.getAttribute("data-ready") === "1") return;
    current = { path: key, hash: h };
    var raw = PAGES[key];
    if (!raw) return;
    view.onload = function () {
      view.setAttribute("data-ready", "1");
      if (!h) return;
      try {
        var doc = view.contentDocument;
        if (!doc) return;
        var el = doc.getElementById(h) || doc.querySelector('[id="' + h + '"]');
        if (el) el.scrollIntoView();
      } catch (e) {}
    };
    view.removeAttribute("data-ready");
    view.srcdoc = patch(raw);
    try {
      if (parent && parent !== window) {
        parent.postMessage({ type: "pc-compare-nav", path: key, hash: h }, "*");
      }
    } catch (e) {}
  }

  window.addEventListener("message", function (ev) {
    if (!ev || ev.source === window) return;
    var data = ev.data;
    if (!data) return;
    if (data.type === "pc-compare-go" || data.type === "pc-compare-nav") {
      go(data.path || "index.html", data.hash || "");
    }
  });

  go(${JSON.stringify(start)}, "");
})();
</script>
</body>
</html>`;
}

export function lookTierSite(look: CompareLookId): {
    files: Record<string, string>;
    nav: CompareNavPage[];
    previewHtml: (path?: string) => string;
} {
    const files = demoFiles(look);
    const styleId = STYLE_BY_LOOK[look];
    const nav: CompareNavPage[] = [];

    if (styleId === "motion") {
        nav.push({ path: "index.html", label: "Home", href: "#top" });
        const home = files["index.html"] ?? "";
        for (const id of ["about", "services", "menu", "gallery", "faq", "contact"] as const) {
            if (home.includes(`id="${id}"`) || home.includes(`data-type="${id}"`)) {
                const labels: Record<string, string> = {
                    about: "About",
                    services: "Services",
                    menu: "Menu",
                    gallery: "Gallery",
                    faq: "FAQ",
                    contact: "Contact",
                };
                nav.push({ path: "index.html", label: labels[id], href: `#${id}` });
            }
        }
        if (files["settings.html"]) {
            nav.push({ path: "settings.html", label: "Settings" });
        }
    } else {
        const order = [
            "index.html",
            "about.html",
            "services.html",
            "menu.html",
            "gallery.html",
            "contact.html",
            "settings.html",
        ];
        for (const path of order) {
            if (files[path]) nav.push({ path, label: labelForPath(path) });
        }
        for (const path of Object.keys(files).sort()) {
            if (!nav.some((n) => n.path === path)) {
                nav.push({ path, label: labelForPath(path) });
            }
        }
    }

    return {
        files,
        nav,
        previewHtml(path = "index.html") {
            return multipagePreviewSrcDoc(files, path);
        },
    };
}

/** Home thumbnail / default live frame — full multipage-capable srcDoc. */
export function lookTierPreviewHtml(look: CompareLookId): string {
    return lookTierSite(look).previewHtml("index.html");
}
