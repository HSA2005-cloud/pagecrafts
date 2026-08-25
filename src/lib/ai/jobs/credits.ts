import type { ErrorCode } from "@/lib/contracts";

/** True when the server refused because this site's AI generation quota is spent. */
export function isOutOfAiCredits(
    code?: ErrorCode,
    message?: string | null,
): boolean {
    if (code !== "payment_required" || !message) return false;

    if (
        /reached \d+ sites|This design needs|paid design|per-site checkout|publish/i.test(
            message,
        )
    ) {
        return false;
    }

    return /AI generation|generations on this site|custom AI build|Upgrade to Pro|Upgrade to Premium|User Plans for more/i.test(
        message,
    );
}

export function isOutOfAiCreditsMessage(message?: string | null): boolean {
    return isOutOfAiCredits("payment_required", message);
}
