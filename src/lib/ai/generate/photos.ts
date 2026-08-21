import type { Composition } from '@/lib/contracts';

const PHOTO = '?w=1600&q=70&auto=format&fit=crop';
const unsplash = (id: string) => `https://images.unsplash.com/${id}${PHOTO}`;

/**
 * Photographs we can stamp without calling Unsplash at generation time.
 * Live search is preferred when a key is configured; this bank keeps the
 * photo-rich look from shipping empty frames in tests and offline deploys.
 */
const BANK = [
    'photo-1509440159596-0249088772ff', // bakery shelf
    'photo-1554118811-1e0d58224f24', // café table
    'photo-1414235077428-338989a2e8c0', // restaurant
    'photo-1499750310107-5fef28a66643', // desk
    'photo-1512917774080-9991f1c4c750', // house at dusk
    'photo-1476514525535-07fb3b4ae5f1', // lake
    'photo-1521737604893-d14cc237f11d', // portrait
    'photo-1452587925148-ce544e77e70d', // camera
    'photo-1560066984-138dadb4c035', // salon
    'photo-1534438327276-14e5300c3a48', // gym
] as const;

/** Colourful plated desserts — not a clothing rail. */
export const DESSERT_PHOTO_ID = 'photo-1551024506-0bccd828d307';
/** Fashion retail interior. Only for clothing/saree/boutique queries. */
export const CLOTHING_PHOTO_ID = 'photo-1441986300917-64674bd600d8';

const KEYWORD_PHOTO: Array<[RegExp, string]> = [
    [/\b(sweet|mithai|dessert|laddu|ladoo|jalebi|halwa|peda|barfi|gulab|confection|chocolate|cupcake)\b/i, DESSERT_PHOTO_ID],
    [/\b(bakery|bread|pastry|cake|patisserie)\b/i, 'photo-1509440159596-0249088772ff'],
    [/\b(cafe|coffee|chai)\b/i, 'photo-1554118811-1e0d58224f24'],
    [/\b(restaurant|dining|kitchen)\b/i, 'photo-1414235077428-338989a2e8c0'],
    [/\b(gym|fitness|yoga)\b/i, 'photo-1534438327276-14e5300c3a48'],
    [/\b(clinic|dental|hospital|doctor|veterinary|vet)\b/i, 'photo-1519494026892-80bbd2d6fd0d'],
    [/\b(saree|clothing|fashion|boutique|apparel|garment|dress|textile)\b/i, CLOTHING_PHOTO_ID],
];

/** Search Unsplash for Indian mithai, never "sweet shop" (that returns villas). */
export const MITHAI_SEARCH = 'indian mithai ladoo barfi gulab jamun tray';

export function isMithaiShop(vertical: string, title = '', query = ''): boolean {
    const text = `${vertical.replace(/[-_]/g, ' ')} ${title} ${query}`;
    return /\b(sweet|mithai|halwai|ladoo|laddu|barfi|jalebi)\b/i.test(text)
        || /sweetshop/i.test(text);
}

/** Vertical + title + slot query, so "shop interior" on a sweet shop still searches for sweets. */
export function photoSearchQuery(vertical: string, title: string, query: string): string {
    if (isMithaiShop(vertical, title, query)) return MITHAI_SEARCH;
    const bits = [vertical.replace(/[-_]/g, ' '), title, query]
        .map((part) => part.trim())
        .filter(Boolean);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const bit of bits) {
        const key = bit.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(bit);
    }
    return unique.join(' ');
}

export function bankPhotoUrl(query: string): string {
    const text = query.trim();
    for (const [re, id] of KEYWORD_PHOTO) {
        if (re.test(text)) return unsplash(id);
    }
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return unsplash(BANK[hash % BANK.length] ?? BANK[0]);
}

function imageQuery(value: unknown): string {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const rec = value as Record<string, unknown>;
        if (typeof rec.query === 'string' && rec.query.trim()) return rec.query.trim();
        if (typeof rec.alt === 'string' && rec.alt.trim()) return rec.alt.trim();
    }
    if (typeof value === 'string' && value.trim()) return value.trim();
    return '';
}

function withUrl(value: unknown, url: string): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { ...(value as Record<string, unknown>), url };
    }
    return { query: typeof value === 'string' ? value : '', alt: '', url };
}

/**
 * Put a photograph URL on every image-shaped prop so the photo-rich look
 * actually shows pictures, not empty slots.
 */
export async function stampPhotoUrls(
    composition: Composition,
    lookup: (query: string) => Promise<string> = async (query) => bankPhotoUrl(query),
    /** When set, only these section types receive photographs (Starter stamps the hero alone). */
    onlyTypes?: ReadonlyArray<Composition['sections'][number]['type']>,
): Promise<Composition> {
    const cache = new Map<string, string>();
    const title = composition.meta.title ?? '';
    const allowed = onlyTypes ? new Set(onlyTypes) : null;

    const resolve = async (query: string, fallback: string): Promise<string> => {
        const search = photoSearchQuery(composition.vertical, title, query || fallback);
        const key = search.toLowerCase();
        const hit = cache.get(key);
        if (hit) return hit;
        // Live Unsplash on "sweet shop" returns villas and clothing rails.
        const url = isMithaiShop(composition.vertical, title, search)
            ? bankPhotoUrl(search)
            : await lookup(search);
        cache.set(key, url);
        return url;
    };

    const sections = await Promise.all(composition.sections.map(async (section) => {
        if (allowed && !allowed.has(section.type)) return section;

        const props = { ...section.props };
        const fallback = `${composition.vertical} ${section.type}`;

        if ('image' in props) {
            const query = imageQuery(props.image) || fallback;
            props.image = withUrl(props.image, await resolve(query, fallback));
        }

        if (Array.isArray(props.images)) {
            props.images = await Promise.all(
                (props.images as unknown[]).map(async (item, index) => {
                    const query = imageQuery(item) || `${fallback} ${index + 1}`;
                    return withUrl(item, await resolve(query, fallback));
                }),
            );
        }

        return { ...section, props };
    }));

    return { ...composition, sections };
}
