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
const PLATE =
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=70&auto=format&fit=crop";
const ROOM =
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=70&auto=format&fit=crop";

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
                    { url: PLATE, query: "plated food", alt: "Plate" },
                    { url: HERO, query: "dining table", alt: "Table" },
                    { url: ROOM, query: "dining room", alt: "Room" },
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
                    row.url = src || PLATE;
                }
            }
        }
    }
    return next;
}

export function lookTierPreviewHtml(look: CompareLookId): string {
    const styleId = STYLE_BY_LOOK[look];
    const styled = ensureImageUrls(applyStyle(demoRestaurantComposition(), STYLE_SPECS[styleId]));
    const html = compositionToFiles(styled, styleId)["index.html"] ?? "";
    if (!html) return "";
    // Inject compact frame rules after <head> so live iframes stay readable.
    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head[^>]*>/i, (open) => `${open}\n${COMPARE_FRAME_CSS}`);
    }
    return `${COMPARE_FRAME_CSS}\n${html}`;
}
