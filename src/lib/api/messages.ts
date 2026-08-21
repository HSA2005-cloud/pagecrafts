import type { ErrorCode } from '@/lib/contracts';

export const OFFLINE_MESSAGE = 'We could not reach PageCrafts. Check your connection and try again.';

export const UNREADABLE_MESSAGE = 'The server sent back something we could not read.';

const FRIENDLY: Record<ErrorCode, string> = {
    unauthorized: 'Please sign in again to continue.',
    forbidden: 'This project belongs to someone else.',
    not_found: 'We could not find this project.',
    // Said as "nothing was lost" first, because the person's fear on seeing a failed save is
    // that their work is gone. It is not: the write was refused before anything changed.
    conflict: 'This project was changed somewhere else. Nothing was lost — reload to get the latest version, then save again.',
    rate_limited: 'That was a lot of saves at once. Wait a moment and try again.',
    spend_capped: 'The daily limit has been reached. Please try again tomorrow.',
    validation_failed: 'Some of your files were rejected.',
    payload_too_large: 'That file is too large to save.',
    generation_failed: 'The site could not be generated.',
    payment_required: 'This needs an upgrade before it can run.',
    hosting_error: 'The hosting service did not respond.',
    service_unavailable: 'PageCrafts is having trouble right now. Your work is safe. Try again in a moment.',
    internal: 'We could not finish that just now. Your work is safe in this tab — try again in a moment.',
};

export function friendlyMessage(code: ErrorCode, fallback: string): string {
    return FRIENDLY[code] ?? fallback;
}