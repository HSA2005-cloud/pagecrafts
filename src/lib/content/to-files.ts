import type { ContentSchema, Field, FileMap } from "@/lib/contracts";

// Putting content back into the markup (R2 D8).
//
// contentFromFiles reads the words out of a design; this writes them in again. The pair is
// what lets the content panel exist at all: the panel edits content_json, and the preview
// has to show the result without anyone hand-writing a renderer per template.
//
// It is deliberately the same `data-slot` attributes in both directions. A slot the reader
// can find is a slot the writer can fill, so a design cannot be editable in the panel and
// unrenderable in the preview, or the reverse.

const ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
};

// Matches blueprint.ts on the way out, so a round trip through the panel leaves the markup
// exactly as a freshly generated template would have written it.
function escapeHtml(value: string): string {
    return value.replace(/[&<>"]/g, (char) => ESCAPES[char]);
}

function fieldOf(schema: ContentSchema, sectionKey: string, fieldKey: string): Field | undefined {
    return schema.sections
        .find((section) => section.key === sectionKey)
        ?.fields.find((field) => field.key === fieldKey);
}

// The value a given slot should now carry, or undefined to leave the markup alone.
function valueForSlot(
    slot: string,
    content: Record<string, unknown>,
    schema: ContentSchema,
): string | undefined {
    const segments = slot.split(".");

    if (segments.length === 2) {
        const [sectionKey, fieldKey] = segments;
        const field = fieldOf(schema, sectionKey, fieldKey);
        // Images are addressed by asset id and resolved at publish, not here; a text
        // substitution would put a uuid where a photograph goes.
        if (!field || field.type === "image" || field.type === "list") return undefined;

        const value = (content[sectionKey] as Record<string, unknown> | undefined)?.[fieldKey];
        return typeof value === "string" ? value : undefined;
    }

    if (segments.length === 4) {
        const [sectionKey, fieldKey, rawIndex, itemKey] = segments;
        const field = fieldOf(schema, sectionKey, fieldKey);
        if (!field || field.type !== "list") return undefined;

        const itemField = (field.itemSchema ?? []).find((f) => f.key === itemKey);
        if (!itemField || itemField.type === "image") return undefined;

        const items = (content[sectionKey] as Record<string, unknown> | undefined)?.[fieldKey];
        if (!Array.isArray(items)) return undefined;

        const item = items[Number(rawIndex)];
        if (item === null || typeof item !== "object") return undefined;

        const value = (item as Record<string, unknown>)[itemKey];
        return typeof value === "string" ? value : undefined;
    }

    return undefined;
}

/**
 * Every HTML file with editable slots showing what content_json says.
 *
 * A slot with nothing to say keeps the markup it already had. That matters more than it
 * sounds: content_json is only ever a partial picture — images live in it as asset ids,
 * fields the person has not touched may be absent entirely — and blanking those slots would
 * turn "I have not edited this yet" into an empty page.
 */
export function applyContentToFiles(
    files: FileMap,
    content: Record<string, unknown>,
    schema: ContentSchema,
): FileMap {
    if (schema.sections.length === 0) return files;

    let changed = false;
    const next: FileMap = { ...files };

    for (const [path, html] of Object.entries(files)) {
        if (!/\.html?$/i.test(path)) continue;

        // The captured groups are: opening tag through to `>`, the slot name, the existing
        // inner markup. Only the third is replaced, so attributes, classes and the element
        // itself survive untouched — the panel edits words, never structure (C-07).
        const rewritten = html.replace(
            /(<([a-z0-9]+)\b[^>]*?\sdata-slot="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/gi,
            (whole, open: string, _tag: string, slot: string, inner: string, close: string) => {
                const value = valueForSlot(slot, content, schema);
                return value === undefined ? whole : `${open}${escapeHtml(value)}${close}`;
            },
        );

        if (rewritten !== html) {
            next[path] = rewritten;
            changed = true;
        }
    }

    return changed ? next : files;
}
