export type CreationIssueKind =
    | 'preview'
    | 'generation'
    | 'chat'
    | 'load'
    | 'photos'
    | 'keys'
    | 'busy'
    | 'daily_cap'
    | 'too_long';

export interface CreationIssue {
    kind: CreationIssueKind;
    title: string;
    what: string;
    instruction: string;
}

function looksLikeMissingKey(message: string): boolean {
    return /\b(api[_ ]?key|unsplash|missing key|not configured|no key)\b/i.test(message);
}

function looksLikePhotos(message: string): boolean {
    return /\b(photo|image|unsplash|picture)\b/i.test(message);
}

/** Groq's per-day token allowance, which unlike a per-minute 429 does not recover by waiting. */
function looksLikeDailyCap(message: string): boolean {
    return /tokens per day|\bTPD\b|tokens\/day|daily token cap|daily allowance/i.test(message);
}

function looksLikeBusy(message: string): boolean {
    return /rate[ _-]?limit|\b429\b|too many requests|tokens per minute|\bTPM\b|capacity/i.test(message);
}

/** finish_reason "length" — the model stopped mid-reply at the output ceiling. */
function looksLikeTooLong(message: string): boolean {
    return /cut off|token ceiling|max_tokens|too large|payload too large|\b413\b/i.test(message);
}

function looksLikeMissingAsset(message: string): boolean {
    return /missing stylesheet|missing script|could not be shown|no .+\.html/i.test(message);
}

/**
 * Turn a raw failure into a sentence a person can act on, plus the instruction
 * AI should run if they confirm.
 */
export function explainCreationIssue(
    raw: string,
    kind: CreationIssueKind = 'preview',
): CreationIssue {
    const message = raw.trim();

    if (kind === 'load' || /could not be opened/i.test(message)) {
        return {
            kind: 'load',
            title: 'This project did not open',
            what: 'The files for this site could not be loaded just now.',
            instruction: 'Reload this project and repair any pages that do not open.',
        };
    }

    if (kind === 'generation' || looksLikeMissingKey(message) || kind === 'keys') {
        if (looksLikeMissingKey(message) || kind === 'keys') {
            return {
                kind: 'keys',
                title: 'A connected service is missing',
                what: 'A key this site needs (photos or another connected service) is not set, so that part could not finish.',
                instruction:
                    'Finish the website without that missing key. Use solid placeholder photos and keep every page working.',
            };
        }
        if (looksLikePhotos(message)) {
            return {
                kind: 'photos',
                title: 'Photos did not load',
                what: 'The pages were written, but photos could not be fetched.',
                instruction:
                    'Repair the site so every page works, using placeholder photos where real ones could not load.',
            };
        }

        // The three causes that actually happen, named. This used to be one sentence for
        // every failure, which meant nobody — including the people building this — could
        // tell "come back tomorrow" from "shorten your description" without the server log.
        if (looksLikeDailyCap(message)) {
            return {
                kind: 'daily_cap',
                title: "Today's AI budget is used up",
                what: 'PageCrafts has hit its limit with the AI provider for today. It resets overnight;'
                    + ' nothing you typed was wrong and nothing was lost.',
                instruction:
                    'Generate this website again from my description once the daily allowance has reset.',
            };
        }
        if (looksLikeBusy(message)) {
            return {
                kind: 'busy',
                title: 'The AI is busy right now',
                what: 'Too many builds are running at once. Waiting a minute is usually enough.',
                instruction:
                    'Generate this website again from my description and make sure every page works.',
            };
        }
        if (looksLikeTooLong(message)) {
            return {
                kind: 'too_long',
                title: 'That description asked for more than one build can hold',
                what: 'The site was still being written when it ran out of room. A shorter description,'
                    + ' or fewer sections, will finish.',
                instruction:
                    'Generate this website again from my description, keeping it to the most important'
                    + ' pages so every one of them completes.',
            };
        }

        if (/cannot turn it into|start a new project for that/i.test(message)) {
            return {
                kind: 'generation',
                title: 'That rebuild was blocked',
                what: message,
                instruction:
                    'Generate another look from the same business brief for this site.',
            };
        }

        return {
            kind: 'generation',
            title: 'This site did not finish building',
            what: message || 'The website started, but a page or section did not complete.',
            instruction:
                'Rebuild this site from the same business brief and finish every page cleanly.',
        };
    }

    if (kind === 'chat') {
        return {
            kind: 'chat',
            title: 'That change did not go through',
            // Surface the exact failure in `what`. Keep `instruction` generic —
            // Fix with AI must retry the person's last ask (ChatPanel), not this string.
            what: message || 'The last request could not be turned into a suggestion.',
            instruction: 'Try that change again and apply a working version of the page.',
        };
    }

    if (looksLikeMissingAsset(message)) {
        return {
            kind: 'preview',
            title: 'This page is missing a file it needs',
            what: 'Part of the page could not be shown because a stylesheet or script it depends on is missing.',
            instruction:
                'Repair missing stylesheets and scripts so every page on this site loads and looks complete.',
        };
    }

    if (/too large/i.test(message)) {
        return {
            kind: 'preview',
            title: 'This page is too large to preview',
            what: 'The page was written, but it is too heavy to show in the editor.',
            instruction: 'Simplify this page so it loads in preview without dropping content people need.',
        };
    }

    return {
        kind: 'preview',
        title: 'This page is not working',
        what: 'The preview hit a problem and could not finish showing the page.',
        instruction: 'Fix the broken page so it loads cleanly in preview, including any missing files or script errors.',
    };
}

/**
 * The instruction Fix with AI should retry after a chat failure.
 *
 * Skips soft-failure / repair sentences that an earlier broken Fix with AI may
 * have posted as user turns, so we land on the person's real request.
 */
export function lastRetryableChatInstruction(
    messages: ReadonlyArray<{ role: string; text: string }>,
    softError: string | null = null,
): string | null {
    const soft = softError?.trim() ?? '';
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const turn = messages[i];
        if (turn.role !== 'user') continue;
        const text = turn.text.trim();
        if (!text) continue;
        if (soft && text === soft) continue;
        if (/Your work is safe in this tab/i.test(text)) continue;
        if (/could not finish that just now/i.test(text)) continue;
        if (/Try that change again and apply a working version/i.test(text)) continue;
        if (/The last request could not be turned into a suggestion/i.test(text)) continue;
        return text;
    }
    return null;
}

export function explainPreviewIssues(messages: readonly string[]): CreationIssue {
    return explainCreationIssue(messages[0] ?? 'This preview had a problem.', 'preview');
}
