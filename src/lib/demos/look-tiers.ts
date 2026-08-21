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

export const COMPARE_LOOKS: {
    id: CompareLookId;
    styleId: StyleId;
    label: string;
    priceInr: number;
    pages: string[];
    features: string[];
    blurb: string;
}[] = [
    {
        id: "starter",
        styleId: "casual",
        label: STYLE_SPECS.casual.label,
        priceInr: STYLE_SPECS.casual.priceInr,
        pages: ["Home", "About", "Services", "Contact", "Settings"],
        features: [
            "Warm colourful paper layout",
            "One hero photograph beside the words",
            "Simple top navigation",
            "Free to use",
        ],
        blurb: STYLE_SPECS.casual.blurb,
    },
    {
        id: "pro",
        styleId: "photos",
        label: STYLE_SPECS.photos.label,
        priceInr: STYLE_SPECS.photos.priceInr,
        pages: ["Home", "About", "Menu", "Gallery", "Contact", "Settings"],
        features: [
            "Cinematic full-bleed photo hero",
            "Photographs through the page",
            "Masonry gallery",
            "Pro · Rs 499",
        ],
        blurb: STYLE_SPECS.photos.blurb,
    },
    {
        id: "premium",
        styleId: "motion",
        label: STYLE_SPECS.motion.label,
        priceInr: STYLE_SPECS.motion.priceInr,
        pages: ["Home", "About", "Services", "FAQ", "Contact", "Settings"],
        features: [
            "Kinetic canvas with business motif",
            "Oversized display type + glow",
            "Motion stage and ticker",
            "Premium · Rs 999",
        ],
        blurb: STYLE_SPECS.motion.blurb,
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
    const heroImg =
        "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=70&auto=format&fit=crop";
    const plate =
        "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=70&auto=format&fit=crop";
    const room =
        "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=70&auto=format&fit=crop";

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
            section("s_hero", "hero", "split-image", {
                eyebrow: DEMO_BRAND.place,
                heading: `${DEMO_BRAND.name} – Fine Dining in ${DEMO_BRAND.place}`,
                lede: "Tables by the glass, plates from the kitchen, reservations every evening.",
                ctaLabel: "Reserve a table",
                ctaHref: "#contact",
                image: { src: heroImg, alt: "Dining table" },
            }),
            section("s_about", "about", "text", {
                heading: "Our house",
                body: "An evening restaurant in Bengaluru — seafood, wine, and a room that stays late.",
                image: { src: room, alt: "Dining room" },
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
                    { title: "Catch of the day", price: "₹1,200", body: "Grilled, lemon butter." },
                    { title: "House pasta", price: "₹890", body: "Seasonal sauce." },
                    { title: "Chocolate pot", price: "₹420", body: "Sea salt." },
                ],
            }),
            section("s_gallery", "gallery", "masonry", {
                heading: "From the room",
                images: [
                    { src: plate, alt: "Plate" },
                    { src: heroImg, alt: "Table" },
                    { src: room, alt: "Room" },
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
                phone: "+91 80 4000 1522",
                email: "book@1522hotel.in",
                hours: "Tue–Sun · 6:30pm – 11:30pm",
                address: "1522, Indiranagar, Bengaluru",
            }),
            section("s_footer", "footer", "simple", {
                tagline: `${DEMO_BRAND.name} · ${DEMO_BRAND.place}`,
            }),
        ],
    };
}

export function lookTierPreviewHtml(look: CompareLookId): string {
    const styleId = STYLE_BY_LOOK[look];
    const styled = applyStyle(demoRestaurantComposition(), STYLE_SPECS[styleId]);
    // Stamp real photo URLs so Photo-rich / Casual hero match Pick-a-look previews.
    if (styleId === "photos" || styleId === "casual") {
        for (const sec of styled.sections) {
            const img = sec.props.image as { src?: string } | undefined;
            if (img && !img.src) {
                img.src =
                    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=70&auto=format&fit=crop";
            }
            const images = sec.props.images as { src?: string }[] | undefined;
            if (Array.isArray(images)) {
                for (const frame of images) {
                    if (frame && !frame.src) {
                        frame.src =
                            "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=70&auto=format&fit=crop";
                    }
                }
            }
        }
    }
    return compositionToFiles(styled, styleId)["index.html"] ?? "";
}
