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
    // No mention of files: this code is returned by the describe form, the content
    // panel and the file save alike, and only one of those has files in it.
    validation_failed: 'Something in that was not accepted.',
    payload_too_large: 'That was too large to send.',
    generation_failed: 'The site could not be generated.',
    payment_required: 'This needs an upgrade before it can run.',
    payments_unavailable:
        'Checkout is not set up on this server yet. Add Razorpay keys to the server environment, then try again.',
    hosting_error: 'The hosting service did not respond.',
    service_unavailable: 'PageCrafts is having trouble right now. Your work is safe. Try again in a moment.',
    internal: 'We could not finish that just now. Your work is safe in this tab — try again in a moment.',
};

/**
 * Our vetted sentence for the code, and only ours.
 *
 * I changed this once to prefer whatever the route said, because the describe form was
 * showing "Some of your files were rejected" on a screen with no files. That was the wrong
 * fix: a route's message is a developer's string -- "nope", a Postgres fault, a provider's
 * refusal -- and api-client and project-source both assert those never reach a reader.
 * copy-audit enforces the same rule across the whole catalogue.
 *
 * The real fault was one badly worded entry, and the entry is what got fixed.
 */
export function friendlyMessage(code: ErrorCode, fallback: string): string {
    return FRIENDLY[code] ?? fallback;
}