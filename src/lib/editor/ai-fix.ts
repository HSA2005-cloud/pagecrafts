export type CreationIssueKind =
    | 'preview'
    | 'generation'
    | 'chat'
    | 'load'
    | 'photos'
    | 'keys';

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
        return {
            kind: 'generation',
            title: 'This site did not finish building',
            what: 'The website started, but a page or section did not complete.',
            instruction:
                'Generate this website again from my description and make sure every page works.',
        };
    }

    if (kind === 'chat') {
        return {
            kind: 'chat',
            title: 'That change did not go through',
            what: 'The last request could not be turned into a suggestion.',
            instruction: message || 'Try that change again and apply a working version of the page.',
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

export function explainPreviewIssues(messages: readonly string[]): CreationIssue {
    return explainCreationIssue(messages[0] ?? 'This preview had a problem.', 'preview');
}
