import { NextResponse } from 'next/server';
import type { ApiResult, ErrorCode } from '@/lib/contracts';
import { statusFor } from './codes';
import { captureError } from '@/lib/observability/capture';

/**
 * What a caller is told when something failed that we did not anticipate.
 *
 * This is the most-read sentence in the product: every unhandled 500, from every route.
 * It said "Something went wrong on our side." until R3 D20 — the exact phrase UI Spec §7.18
 * exists to prevent, and the one the D19 copy audit removed from six other places while
 * walking straight past these two, because that audit's surface list covered components and
 * pages and not `lib/errors` or `lib/kernel`. The highest-traffic instance was the one it
 * could not see.
 *
 * Shared by both entry points so they cannot drift, and exported so the copy audit and the
 * contract tests can name it.
 */
export const UNEXPECTED_FAILURE =
    'We could not finish that just now. Nothing you have done is lost — try again in a moment.';

export class ApiError extends Error {
    constructor(
        readonly code: ErrorCode,
        message: string,
        readonly detail?: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * True for an ApiError even when the class object differs across a reloaded
 * module graph (`instanceof` then fails and the route would answer `internal`).
 */
export function isApiError(err: unknown): err is ApiError {
    if (err instanceof ApiError) return true;
    if (!err || typeof err !== 'object') return false;
    const candidate = err as { name?: unknown; code?: unknown; message?: unknown };
    return (
        candidate.name === 'ApiError' &&
        typeof candidate.code === 'string' &&
        typeof candidate.message === 'string'
    );
}

export function ok<T>(data: T, status = 200) {
    return NextResponse.json<ApiResult<T>>({ ok: true, data }, { status });
}

export function fail(code: ErrorCode, message: string, detail?: string) {
    return NextResponse.json<ApiResult<never>>(
        { ok: false, error: { code, message, ...(detail ? { detail } : {}) } },
        { status: statusFor(code) },
    );
}

export async function guard(handler: () => Promise<Response>): Promise<Response> {
    try {
        return await handler();
    } catch (err) {
        if (isApiError(err)) return fail(err.code, err.message, err.detail);

        captureError(err, { tags: { boundary: 'guard' } });
        console.error('[api]', err);

        return fail('internal', UNEXPECTED_FAILURE);
    }
}