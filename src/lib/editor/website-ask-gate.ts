/**
 * Ask is website-only: it may change this site, not answer general questions or
 * fetch unrelated media. Pure heuristics — gated before the LLM on client and server.
 */

const WEBSITE_SIGNAL =
    /\b(website|web\s*site|site|page|homepage|home\s*page|landing|hero|section|headline|heading|subhead|button|cta|nav|menu|footer|header|banner|logo|copy|text|wording|colour|color|font|layout|spacing|margin|padding|centre|center|align|position|move|shift|wider|narrower|bigger|smaller|background|gallery|card|form|contact|about|services|pricing|testimonial|review|map|address|phone|email|whatsapp|seo|title|meta|favicon|mobile|desktop|responsive|css|style|theme|look|design|brand|business\s+name|rename|replace\s+the|change\s+the|update\s+the|edit\s+the|make\s+(it|this|the)|add\s+(a|an|the)|remove\s+(the|this)|delete\s+(the|this)|on\s+(the|this)\s+(page|site|hero|section)|(image|photo|picture)\s+(on|in|for|of)\s+(the|this|my)|(use|put|set|swap|replace)\s+(a\s+|the\s+|this\s+)?(image|photo|picture))\b/i;

const OFF_TOPIC =
    /\b((show|send|find|get|give)\s+me\s+(a\s+)?(photo|picture|image|gif|video|meme)\b|\bwhat('?s|\s+is)\s+the\s+weather\b|\bwho\s+(is|was|won)\b|\btell\s+me\s+(a\s+)?(joke|story|fun\s*fact)\b|\bwrite\s+(me\s+)?(a\s+)?(poem|essay|song|recipe)\b|\bcapital\s+of\b|\btranslate\s+this\b|\bcode\s+(a|me)\s+(python|javascript|react)\b|\bchatgpt\b|\bhow\s+do\s+i\s+(invest|cook|lose\s+weight)\b)/i;

const LAYOUT_OR_VISUAL =
    /\b(cent(er|re)(\s|-)?(stage|ed|ing)?|middle|align(ment|ed)?|spacing|space\s+out|margin|padding|gap|from\s+the\s+top|to\s+the\s+top|too\s+(high|low|far|close)|push\b[\s\S]{0,40}\b(up|down|left|right)\b|move\b[\s\S]{0,40}\b(up|down|left|right|it)\b|shift\s+(up|down)|lower|raise|indent|layout|position|sticky|fixed|flex|grid|column|columns|side\s*by\s*side|stack(ed)?|full[\s-]?width|narrow(er)?|wide(r)?|bigger|smaller|font[\s-]?size|line[\s-]?height|letter[\s-]?spacing|overflow|z[\s-]?index|absolute|relative|css|stylesheet|looks?\s+cramped|too\s+tight|breathing\s+room|whitespace|white\s+space)\b/i;

export function isLayoutOrVisualAsk(instruction: string): boolean {
    return LAYOUT_OR_VISUAL.test(instruction.trim());
}

/**
 * Returns a user-facing rejection when the instruction is not about editing this
 * website; otherwise null (allowed).
 */
export function offTopicWebsiteAsk(instruction: string): string | null {
    const text = instruction.trim();
    if (!text) return null;

    // Off-topic first — bare "photo" must not count as a site edit cue.
    if (OFF_TOPIC.test(text)) {
        return (
            'Ask only changes this website — copy, layout, colours, images on the page, ' +
            'and sections. It cannot answer general questions or show unrelated photos.'
        );
    }

    if (WEBSITE_SIGNAL.test(text)) return null;
    if (isLayoutOrVisualAsk(text)) return null;

    // Short prompts with no website cue and a clear Q&A shape.
    if (
        /^(who|what|when|where|why|how|can\s+you|do\s+you|are\s+you)\b/i.test(text) &&
        text.length < 120 &&
        !/\b(page|site|section|hero|heading|button|colour|color|layout)\b/i.test(text)
    ) {
        return (
            'Ask only edits this website. Describe a change to the page ' +
            '(for example: “centre the hero” or “shorten the headline”).'
        );
    }

    return null;
}

/** Prefer the page HTML path whenever the site has code Ask can edit. */
export function shouldUsePageEdit(
    instruction: string,
    opts: { hasEntryHtml: boolean },
): boolean {
    if (!opts.hasEntryHtml) return false;
    // Layout always; any other website ask also goes through code so Ask can
    // change whatever the live HTML needs — not only section JSON props.
    if (isLayoutOrVisualAsk(instruction)) return true;
    if (offTopicWebsiteAsk(instruction)) return false;
    return true;
}
