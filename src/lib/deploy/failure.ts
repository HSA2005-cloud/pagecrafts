import type { PublishError } from "./errors";

// What went wrong with a publish, and what the person should do about it (R3 D18, V-7).
//
// Until now a failed publish stored one sentence and nothing else, assembled where it
// happened. That has three problems, and all three show up on the dashboard rather than in
// the code:
//
//   · The sentence says what broke and stops there. "We could not upload your site files."
//     is true and leaves the reader with no idea whether to wait, retry, or ask for help.
//   · A verification timeout stored the literal string `verification_timeout` — a code, in
//     a column a person reads.
//   · Improving the wording fixed nothing already written, because the prose *was* the
//     record. Every row already in the table keeps whatever sentence it was given.
//
// So the row stores a reason, and the words are derived from it at read time. The reason is
// a closed set, which is what makes "verify the dashboard does this for each failure mode"
// a thing a test can check rather than a thing somebody eyeballs once.

/**
 * Why a publish attempt stopped.
 *
 * Closed and small on purpose. A new member is a deliberate act that forces a message to be
 * written for it — `Record<FailureReason, ...>` below will not compile otherwise.
 */
export type FailureReason =
    /** No site could be created on the host. */
    | "provisioning_failed"
    /** The site exists; its files did not get there. */
    | "upload_failed"
    /** The files are there; hosting would not turn on. */
    | "hosting_failed"
    /** Everything is in place and the address has not started answering yet. */
    | "not_answering_yet"
    /** The project has no files to publish. */
    | "nothing_to_publish"
    /** Publishing is not paid for. */
    | "not_paid_for"
    /** Anything we did not anticipate. */
    | "unknown";

export interface FailureMessage {
    /** What happened, in the person's terms. One sentence, no code, no jargon. */
    what: string;
    /** What happens next, or what they can do. Never "something went wrong". */
    next: string;
    /** Whether pressing publish again is a sensible thing to do. */
    retryable: boolean;
}

/**
 * The words, keyed on the reason.
 *
 * Rules these follow, from UI Spec §7.18 and Doc 22:
 *   · Never a code, an HTTP status, a provider's name or a stack frame.
 *   · Say what is still true — "your site is safe", "nothing was lost" — because the fear a
 *     failed publish creates is that the work is gone.
 *   · Say what to do, and only offer an action that exists.
 */
const MESSAGES: Record<FailureReason, FailureMessage> = {
    provisioning_failed: {
        what: "We could not set up a home for your site.",
        next: "Nothing has been lost — your site is saved exactly as you left it. Try publishing again in a few minutes.",
        retryable: true,
    },
    upload_failed: {
        what: "Your site's address is reserved, but we could not get the files there.",
        next: "Your work is safe and the address is still yours. Publishing again will pick up where this stopped.",
        retryable: true,
    },
    hosting_failed: {
        what: "Your files are uploaded, but we could not switch the site on.",
        next: "Nothing needs redoing. Try publishing again — if it happens twice, tell us and we will finish it by hand.",
        retryable: true,
    },
    not_answering_yet: {
        // Not a failure at all, and the message has to say so, because a person watching a
        // spinner for two minutes assumes the worst.
        what: "Your site is published and the address is still switching on.",
        next: "This usually takes a couple of minutes and finishes on its own. You can close this page — it will be live when you come back.",
        retryable: false,
    },
    nothing_to_publish: {
        what: "There is nothing in this site to publish yet.",
        next: "Add or edit some content first, then publish.",
        retryable: false,
    },
    not_paid_for: {
        what: "This site needs to be paid for before it can go live.",
        next: "Unlock publishing and your site will go up straight away.",
        retryable: false,
    },
    unknown: {
        what: "Publishing did not finish.",
        next: "Nothing you have made is lost. Try again in a few minutes, and tell us if it keeps happening.",
        retryable: true,
    },
};

const REASONS = new Set<string>(Object.keys(MESSAGES));

/** Narrow a stored value to a reason we have words for. Anything else reads as unknown. */
export function toFailureReason(value: string | null | undefined): FailureReason {
    return value && REASONS.has(value) ? (value as FailureReason) : "unknown";
}

/** The words for a stored reason. Never throws and never returns nothing to say. */
export function failureMessage(reason: string | null | undefined): FailureMessage {
    return MESSAGES[toFailureReason(reason)];
}

/** One line, for somewhere that has room for only one. */
export function failureLine(reason: string | null | undefined): string {
    const { what, next } = failureMessage(reason);
    return `${what} ${next}`;
}

/** Every reason, for tests and for anything that wants to enumerate the failure modes. */
export const FAILURE_REASONS = Object.keys(MESSAGES) as FailureReason[];

/** The stage names publish() reports, mapped to the reason each failure there means. */
const STAGE_REASON: Record<string, FailureReason> = {
    provisioning: "provisioning_failed",
    pushing: "upload_failed",
    enabling_hosting: "hosting_failed",
    verifying: "not_answering_yet",
};

export function reasonForStage(stage: string): FailureReason {
    return STAGE_REASON[stage] ?? "unknown";
}

/**
 * The reason behind a thrown error.
 *
 * `payment_required` and `validation_failed` are the two that can reach here from the API's
 * own vocabulary rather than from the provider; everything else that is not a PublishError
 * is genuinely unanticipated and says so, rather than being dressed up as a known problem.
 */
export function reasonForError(error: unknown): FailureReason {
    const candidate = error as Partial<PublishError> | undefined;
    if (candidate?.name === "PublishError") {
        if (candidate.code === "payment_required") return "not_paid_for";
        if (candidate.code === "validation_failed") {
            return candidate.reason ?? "nothing_to_publish";
        }
        return candidate.reason ?? "unknown";
    }

    // Plain Errors from missing HOSTING_* / sealed credential land here when something
    // throws before toPublishError wraps them. Treat them as provisioning failures so the
    // owner hears a real sentence instead of an env-var name.
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (
        /deploy credential is not configured/i.test(message) ||
        /missing environment variable:\s*HOSTING_/i.test(message) ||
        /missing environment variable:\s*PAGECRAFT_ROOT_DOMAIN/i.test(message) ||
        /SECRET_MASTER_KEY/i.test(message)
    ) {
        return "provisioning_failed";
    }

    return "unknown";
}
