import type { ContentSchema, Field, FileMap } from "@/lib/contracts";

// Seeding content_json from a design's own markup (R3 D7).
//
// A fork copies the template's files, so the site renders the template's words from the
// first second. content_json, though, started empty — which meant the content panel opened
// on a column of blank inputs describing a page that plainly was not blank. Every field
// then had two truths: what the file said, and what the panel said. Typing in one field and
// saving wrote that field into content_json and left the rest empty, so the panel and the
// page disagreed about everything the person had not touched yet.
//
// The fix is to read the starting values out of the markup at fork time, from the same
// `data-slot` attributes the editor writes back through. The file is the source; this just
// stops the two from starting out of step.

// `<h1 data-slot="hero.headline">Stronger every day.</h1>` — the tag is captured so the
// closing tag can be matched, which keeps a nested element from ending the capture early.
const SLOT_RE = /<([a-z0-9]+)\b[^>]*?\sdata-slot="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;

// blueprint.ts escapes copy on the way in; this reverses exactly that set. `&amp;` is done
// last so "&amp;lt;" comes back as "&lt;" and not as "<".
function unescapeHtml(value: string): string {
    return value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
}

function textOf(inner: string): string {
    return unescapeHtml(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function fieldOf(schema: ContentSchema, sectionKey: string, fieldKey: string): Field | undefined {
    return schema.sections
        .find((section) => section.key === sectionKey)
        ?.fields.find((field) => field.key === fieldKey);
}

/**
 * The content_json a freshly forked project should start with: every scalar slot the schema
 * knows about, carrying the words that are actually in the file.
 *
 * Image slots are deliberately left unset. content_json holds an asset id for an image, and
 * a template's photo is a URL in the markup with no `assets` row behind it — writing the URL
 * there would put a value in the column that its own schema rejects, and the first save of
 * any other field would fail validation on it. The picture still shows, because the file
 * still has it; the slot simply has nothing to say until someone picks an asset.
 *
 * Anything the markup mentions but the schema does not is skipped for the same reason: the
 * panel is generated from the schema, so a value it cannot render is a value nobody can ever
 * see or correct.
 */
/**
 * Carry image slots across when content is rebuilt from a different set of files (R3 D7).
 *
 * contentFromFiles cannot recover an image slot: the value is an asset id and the markup
 * only has a URL. So rebuilding content from files and writing the result straight back
 * would clear every picture the owner had chosen — a restore of last Tuesday's words would
 * quietly unpick this morning's photograph, which nobody asked for and nothing announced.
 *
 * The words come from the files, because the files are what the page now says. The images
 * are kept, because nothing in the files can say anything truer about them.
 */
export function keepImages(
    previous: Record<string, unknown>,
    next: Record<string, unknown>,
    schema: ContentSchema,
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...next };

    for (const section of schema.sections) {
        const before = previous[section.key] as Record<string, unknown> | undefined;
        if (!before) continue;

        for (const field of section.fields) {
            if (field.type === "image") {
                if (before[field.key] === undefined) continue;
                merged[section.key] = { ...(merged[section.key] as Record<string, unknown>) };
                (merged[section.key] as Record<string, unknown>)[field.key] = before[field.key];
                continue;
            }

            // An image nested in a list item, matched by position: the restored list decides
            // how many items there are, and an item that no longer exists takes its picture
            // with it.
            if (field.type === "list") {
                const imageKeys = (field.itemSchema ?? [])
                    .filter((f) => f.type === "image")
                    .map((f) => f.key);
                if (imageKeys.length === 0) continue;

                const beforeItems = before[field.key];
                const nextItems = (merged[section.key] as Record<string, unknown> | undefined)?.[field.key];
                if (!Array.isArray(beforeItems) || !Array.isArray(nextItems)) continue;

                const items = nextItems.map((item, index) => {
                    const priorItem = beforeItems[index];
                    if (priorItem === null || typeof priorItem !== "object") return item;

                    const carried: Record<string, unknown> = { ...(item as Record<string, unknown>) };
                    for (const key of imageKeys) {
                        const value = (priorItem as Record<string, unknown>)[key];
                        if (value !== undefined) carried[key] = value;
                    }
                    return carried;
                });

                merged[section.key] = { ...(merged[section.key] as Record<string, unknown>), [field.key]: items };
            }
        }
    }

    return merged;
}

export function contentFromFiles(files: FileMap, schema: ContentSchema): Record<string, unknown> {
    const htmlPages = Object.entries(files)
        .filter(([path]) => /\.html?$/i.test(path))
        .sort(([a], [b]) => {
            if (a === "index.html") return -1;
            if (b === "index.html") return 1;
            return a.localeCompare(b);
        });
    const html = htmlPages.map(([, source]) => source).join("\n");
    const content: Record<string, unknown> = {};
    // section -> field -> index -> item, collected separately because list items arrive one
    // slot at a time and in whatever order the markup happens to put them.
    const lists = new Map<string, Map<number, Record<string, string>>>();

    for (const [, , slot, inner] of html.matchAll(SLOT_RE)) {
        const segments = slot.split(".");
        const text = textOf(inner);

        if (segments.length === 2) {
            const [sectionKey, fieldKey] = segments;
            const field = fieldOf(schema, sectionKey, fieldKey);
            if (!field || field.type === "image" || field.type === "list") continue;

            const section = (content[sectionKey] as Record<string, unknown>) ?? {};
            section[fieldKey] = text;
            content[sectionKey] = section;
            continue;
        }

        // `<section>.<field>.<index>.<key>` — one cell of one card.
        if (segments.length === 4) {
            const [sectionKey, fieldKey, rawIndex, itemKey] = segments;
            const field = fieldOf(schema, sectionKey, fieldKey);
            if (!field || field.type !== "list") continue;
            if (!(field.itemSchema ?? []).some((f) => f.key === itemKey)) continue;

            const index = Number(rawIndex);
            if (!Number.isInteger(index) || index < 0) continue;

            const key = `${sectionKey}.${fieldKey}`;
            const byIndex = lists.get(key) ?? new Map<number, Record<string, string>>();
            const item = byIndex.get(index) ?? {};
            item[itemKey] = text;
            byIndex.set(index, item);
            lists.set(key, byIndex);
        }
    }

    // Sorted by the index in the markup, so the panel lists the cards in the order they
    // appear on the page rather than the order the regex happened to find them.
    for (const [key, byIndex] of lists) {
        const [sectionKey, fieldKey] = key.split(".");
        const items = [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, item]) => item);

        const section = (content[sectionKey] as Record<string, unknown>) ?? {};
        section[fieldKey] = items;
        content[sectionKey] = section;
    }

    return content;
}
