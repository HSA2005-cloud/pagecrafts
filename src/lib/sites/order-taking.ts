const ORDER_WORDS =
    /\b(order|orders|ordering|cart|checkout|menu\b|takeaway|take-away|delivery|upi|pay now|buy now|add to cart|online order|order online|food order|shop|store|bakery|cafe|café|restaurant|sweet shop|mithai|kirana)\b/i;

const ORDER_HTML =
    /\b(order now|place order|add to cart|buy now|checkout|pay with upi|whatsapp me orders)\b/i;

const ORDER_VERTICALS =
    /\b(bakery|cafe|café|restaurant|food|catering|sweet|mithai|kirana|grocery|boutique|florist|cloud-kitchen|cloud kitchen|tiffin|dhaba)\b/i;

const ORDER_CATEGORIES = new Set([
    'restaurant',
    'store',
    'food',
    'retail',
    'hospitality',
]);

export function isOrderTakingSite(input: {
    prompt?: string | null;
    html?: string | null;
    vertical?: string | null;
    category?: string | null;
}): boolean {
    const prompt = input.prompt?.trim() ?? '';
    const html = input.html?.trim() ?? '';
    const vertical = (input.vertical ?? '').replace(/[-_]/g, ' ');
    const category = (input.category ?? '').trim().toLowerCase();

    if (category && ORDER_CATEGORIES.has(category) && ORDER_WORDS.test(prompt || html || vertical)) {
        return true;
    }
    if (ORDER_VERTICALS.test(vertical) && (ORDER_WORDS.test(prompt) || ORDER_HTML.test(html) || !prompt)) {
        return true;
    }
    if (ORDER_WORDS.test(prompt)) return true;
    if (ORDER_HTML.test(html)) return true;
    return false;
}
