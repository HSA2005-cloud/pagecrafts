import type { Composition } from '@/lib/contracts';

const PHOTO = '?w=1600&q=70&auto=format&fit=crop';
const unsplash = (id: string) => `https://images.unsplash.com/${id}${PHOTO}`;

/**
 * Photographs we can stamp without calling Unsplash at generation time.
 * Live search is preferred when a key is configured; this bank keeps the
 * photo-rich look from shipping empty frames in tests and offline deploys.
 *
 * Unmatched queries must NOT fall through to a food-heavy list — travel vlogs
 * were landing on bakery bread because the old default bank started with food.
 * Every id here must return 200 on images.unsplash.com (dead ids blank Pick a look).
 */
const GENERAL_PHOTOS = [
    'photo-1476514525535-07fb3b4ae5f1', // lake
    'photo-1469474968028-56623f02e42e', // mountain valley
    'photo-1469854523086-cc02fe5d8800', // road trip overlook
    'photo-1441974231531-c6227db76b6e', // forest path
    'photo-1506905925346-21bda4d32df4', // alpine peaks
    'photo-1452587925148-ce544e77e70d', // camera
    'photo-1499750310107-5fef28a66643', // desk
    'photo-1512917774080-9991f1c4c750', // house at dusk
    'photo-1521737604893-d14cc237f11d', // portrait
    'photo-1560066984-138dadb4c035', // salon
    'photo-1534438327276-14e5300c3a48', // gym
] as const;

/** Dining / restaurant heroes — large enough that Set 2 can skip Set 1's pick. */
const RESTAURANT_PHOTOS = [
    'photo-1414235077428-338989a2e8c0',
    'photo-1517248135467-4c7edcad34c4',
    'photo-1504674900247-0877df9cc836',
    'photo-1559339352-11d035aa65de',
    'photo-1416879595882-3373a0480b5b',
    'photo-1565299624946-b28f40a0ae38',
    'photo-1466978913421-dad2ebd01d17',
    'photo-1546069901-ba9599a7e63c',
    'photo-1476224203421-9ac39bcb3327',
] as const;

const CAFE_PHOTOS = [
    'photo-1554118811-1e0d58224f24',
    'photo-1495474472287-4d71bcdd2085',
    'photo-1501339847302-ac426a4a7cbb',
    'photo-1442512595331-e89e73853f31',
] as const;

const BAKERY_PHOTOS = [
    'photo-1509440159596-0249088772ff',
    'photo-1517433670267-08bbd4be890f',
    'photo-1555507036-ab1f4038808a',
    'photo-1578985545062-69928b1d9587',
] as const;

/** Clinic / hospital / surgery — every id must 200 on images.unsplash.com. */
const CLINIC_PHOTOS = [
    'photo-1519494026892-80bbd2d6fd0d',
    'photo-1516549655169-df83a0774514',
    'photo-1579684385127-1ef15d508118',
    'photo-1586773860418-d37222d8fce3',
    'photo-1666214280557-f1b5022eb634',
] as const;

const GYM_PHOTOS = [
    'photo-1534438327276-14e5300c3a48',
    'photo-1517836357463-d25dfeac3438',
    'photo-1571019614242-c5c5dee9f50b',
] as const;

/** Travel / nature / vlog — never food when the brief is about journeys outdoors. */
const TRAVEL_PHOTOS = [
    'photo-1469474968028-56623f02e42e', // green mountains
    'photo-1469854523086-cc02fe5d8800', // road trip overlook
    'photo-1476514525535-07fb3b4ae5f1', // lake canoe
    'photo-1506905925346-21bda4d32df4', // snow peaks
    'photo-1441974231531-c6227db76b6e', // sunlit forest
    'photo-1488646953014-85cb44e25828', // suitcase travel
    'photo-1530789253388-582c481c54b0', // traveler viewpoint
    'photo-1470071459604-3b5ec3a7fe05', // foggy hills
    'photo-1464822759023-fed622ff2c3b', // mountain ridge
    'photo-1500530855697-b586d89ba3ee', // desert road trip
] as const;

/** Colourful plated desserts — not a clothing rail. */
export const DESSERT_PHOTO_ID = 'photo-1551024506-0bccd828d307';
/** Fashion retail interior. Only for clothing/saree/boutique queries. */
export const CLOTHING_PHOTO_ID = 'photo-1441986300917-64674bd600d8';
/** Known bakery shelf — used to assert travel briefs never pick food. */
export const BAKERY_SHELF_PHOTO_ID = 'photo-1509440159596-0249088772ff';

const KEYWORD_PHOTO: Array<[RegExp, readonly string[]]> = [
    [/\b(sweet|mithai|dessert|laddu|ladoo|jalebi|halwa|peda|barfi|gulab|confection|chocolate|cupcake)\b/i, [DESSERT_PHOTO_ID]],
    [/\b(bakery|bread|pastry|cake|patisserie)\b/i, BAKERY_PHOTOS],
    [/\b(cafe|coffee|chai)\b/i, CAFE_PHOTOS],
    [/\b(restaurant|dining|kitchen|fine dining)\b/i, RESTAURANT_PHOTOS],
    [/\b(travel|traveller|traveler|tourism|tourist|vlog|vlogger|journey|adventure|wander|wanderlust|nature|outdoor|outdoors|hiking|trek|trekking|camping|landscape|mountain|forest|lake|beach|safari|road.?trip|itinerary|explore)\b/i, TRAVEL_PHOTOS],
    [/\b(gym|fitness|yoga)\b/i, GYM_PHOTOS],
    [/\b(clinic|dental|hospital|doctor|veterinary|vet|surgery|surgical|surgeon|neurosurg|medical|healthcare)\b/i, CLINIC_PHOTOS],
    [/\b(saree|clothing|fashion|boutique|apparel|garment|dress|textile)\b/i, [CLOTHING_PHOTO_ID]],
];

function hashPick(text: string, size: number): number {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return size > 0 ? hash % size : 0;
}

/** Unsplash photo id from a full URL (strips size/query). */
export function photoKeyFromUrl(url: string): string {
    const match = url.match(/photo-[0-9A-Za-z_-]+/);
    if (match) return match[0].toLowerCase();
    return url.split('?')[0]?.toLowerCase() ?? url.toLowerCase();
}

/** Hero photograph keys already stamped on a composition. */
export function heroPhotoKeysFromComposition(composition?: Composition | null): string[] {
    if (!composition) return [];
    const keys: string[] = [];
    for (const section of composition.sections) {
        if (section.type !== 'hero') continue;
        const image = section.props.image;
        if (image && typeof image === 'object' && !Array.isArray(image)) {
            const url = (image as { url?: unknown }).url;
            if (typeof url === 'string' && url.trim()) keys.push(photoKeyFromUrl(url));
        }
    }
    return keys;
}

function pickFromPool(
    ids: readonly string[],
    saltKey: string,
    exclude: ReadonlySet<string>,
): string {
    const available = ids.filter((id) => !exclude.has(id.toLowerCase()));
    const pool = available.length > 0 ? available : ids;
    return pool[hashPick(saltKey, pool.length)] ?? pool[0] ?? ids[0];
}

/** Search Unsplash for Indian mithai, never "sweet shop" (that returns villas). */
export const MITHAI_SEARCH = 'indian mithai ladoo barfi gulab jamun tray';

export function isMithaiShop(vertical: string, title = '', query = ''): boolean {
    const text = `${vertical.replace(/[-_]/g, ' ')} ${title} ${query}`;
    return /\b(sweet|mithai|halwai|ladoo|laddu|barfi|jalebi)\b/i.test(text)
        || /sweetshop/i.test(text);
}

/**
 * Vertical + title + description + slot query.
 * Description matters: "Explore nature videos" must steer the photo away from food.
 */
export function photoSearchQuery(
    vertical: string,
    title: string,
    query: string,
    description = '',
): string {
    if (isMithaiShop(vertical, title, `${query} ${description}`)) return MITHAI_SEARCH;
    const bits = [vertical.replace(/[-_]/g, ' '), title, description, query]
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

/**
 * Offline / fallback photograph.
 *
 * `salt` (job id) picks which photo in a keyword pool. `exclude` skips heroes already
 * shown on earlier Sets for this project — salt alone still collides on a small pool.
 */
export function bankPhotoUrl(
    query: string,
    salt = '',
    exclude: ReadonlySet<string> = new Set(),
): string {
    const text = query.trim();
    const key = `${salt}:${text}`;
    for (const [re, ids] of KEYWORD_PHOTO) {
        if (re.test(text)) {
            return unsplash(pickFromPool(ids, key, exclude));
        }
    }
    return unsplash(pickFromPool(GENERAL_PHOTOS, key, exclude));
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
    /** Job / attempt salt so regenerate (Set 2) does not reuse Set 1's bank photo. */
    salt = '',
    /** Hero photo keys already shown on earlier Sets for this project. */
    exclude: ReadonlySet<string> = new Set(),
): Promise<Composition> {
    const cache = new Map<string, string>();
    const title = composition.meta.title ?? '';
    const description = composition.meta.description ?? '';
    const allowed = onlyTypes ? new Set(onlyTypes) : null;

    const resolve = async (query: string, fallback: string): Promise<string> => {
        const search = photoSearchQuery(composition.vertical, title, query || fallback, description);
        const key = search.toLowerCase();
        const hit = cache.get(key);
        if (hit) return hit;
        // Live Unsplash on "sweet shop" returns villas and clothing rails.
        const url = isMithaiShop(composition.vertical, title, `${search} ${description}`)
            ? bankPhotoUrl(search, salt, exclude)
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
