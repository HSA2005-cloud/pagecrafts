import 'server-only';
import type { ErrorCode } from '@/lib/contracts/error-codes';
import { redact } from './credentials';
import { reasonForStage, type FailureReason } from './failure';

export class PublishError extends Error {
    constructor(
        readonly code: ErrorCode,
        message: string,
        readonly detail?: string,
        /**
         * The site that had already been claimed when this failed, if one had.
         *
         * A publish that dies after provisioning has taken a subdomain on the host. Losing
         * that fact means the retry re-derives the address, finds it taken by the site we
         * just abandoned, and publishes to `name-2` instead — so a transient upload error
         * silently moves somebody's address and leaves the first site orphaned (R3 D17).
         */
        readonly siteId?: string | null,
        /**
         * Why this stopped, as a value rather than as a sentence (R3 D18).
         *
         * The sentence used to be the whole record, so the dashboard could only repeat what
         * was written at the moment of failure — no "what happens next", no way to improve
         * the wording for rows already stored, and in one case a bare `verification_timeout`
         * shown to a person. The reason is stored; lib/deploy/failure.ts turns it into words
         * when somebody reads it.
         */
        readonly reason: FailureReason = 'unknown',
    ) {
        super(message);
        this.name = 'PublishError';
    }
}

const STAGE_MESSAGE: Record<string, string> = {
    provisioning: 'We could not set up a home for your site.',
    pushing: 'We could not upload your site files.',
    enabling_hosting: 'We could not switch your site on.',
    verifying: 'Your site is taking longer than usual to appear.',
};

export function toPublishError(
    stage: string,
    error: unknown,
    siteId?: string | null,
): PublishError {
    if (error instanceof PublishError) {
        // An inner PublishError may have been raised before the site id was known. Carry it
        // through rather than dropping it, and never overwrite one that is already set.
        return error.siteId || !siteId
            ? error
            : new PublishError(error.code, error.message, error.detail, siteId, error.reason);
    }

    const detail = error instanceof Error ? error.message : String(error);
    const status =
        error && typeof error === 'object' && 'status' in error
            ? Number((error as { status?: number }).status)
            : undefined;

    // Name / address already taken — surface the host's words so the owner can rename.
    if (status === 409 && /taken|reserved|already/i.test(detail)) {
        return new PublishError(
            'validation_failed',
            detail,
            redact(detail),
            siteId ?? null,
            'provisioning_failed',
        );
    }

    return new PublishError(
        'hosting_error',
        STAGE_MESSAGE[stage] ?? 'Publishing failed.',
        redact(detail),
        siteId ?? null,
        reasonForStage(stage),
    );
}

export function notEntitled(): PublishError {
    return new PublishError(
        'payment_required',
        'Publishing needs to be unlocked before this site can go live.',
        undefined,
        null,
        'not_paid_for',
    );
}