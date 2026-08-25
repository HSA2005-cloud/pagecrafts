import type { ErrorCode } from '@/lib/contracts';

export const ERROR_STATUS: Record<ErrorCode, number> = {
    unauthorized: 401,
    forbidden: 403,
    not_found: 404,
    conflict: 409,
    rate_limited: 429,
    spend_capped: 429,
    validation_failed: 422,
    payload_too_large: 413,
    generation_failed: 502,
    payment_required: 402,
    payments_unavailable: 503,
    hosting_error: 502,
    service_unavailable: 503,
    internal: 500,
};

export function statusFor(code: ErrorCode): number {
    return ERROR_STATUS[code] ?? 500;
}