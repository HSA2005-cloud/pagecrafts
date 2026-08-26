import type { ApiResult, ErrorCode } from '@/lib/contracts';
import { friendlyMessage, OFFLINE_MESSAGE, UNREADABLE_MESSAGE } from './messages';

export interface CallResult<T> {
    data: T | null;
    error: string | null;
    /**
     * The route's own sentence when the envelope carried one.
     * Prefer this for AI edit failures — friendlyMessage collapses some codes.
     */
    detail?: string | null;
    /** Present when the server answered with an error envelope. */
    code?: ErrorCode;
}

async function call<T>(path: string, init?: RequestInit): Promise<CallResult<T>> {
    let response: Response;

    // A multipart body carries its own content type, boundary and all. Setting one by hand
    // makes the server unable to find the parts.
    const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData;

    try {
        response = await fetch(path, {
            ...init,
            headers: isForm
                ? { ...(init?.headers ?? {}) }
                : { 'content-type': 'application/json', ...(init?.headers ?? {}) },
        });
    } catch {
        return { data: null, error: OFFLINE_MESSAGE };
    }

    let body: ApiResult<T>;

    try {
        body = (await response.json()) as ApiResult<T>;
    } catch {
        return { data: null, error: UNREADABLE_MESSAGE };
    }

    if (!body || typeof body !== 'object' || !('ok' in body)) {
        return { data: null, error: UNREADABLE_MESSAGE };
    }

    if (!body.ok) {
        const detail =
            typeof body.error.message === 'string' && body.error.message.trim()
                ? body.error.message.trim()
                : null;
        return {
            data: null,
            error: friendlyMessage(body.error.code, body.error.message),
            detail,
            code: body.error.code,
        };
    }

    return { data: body.data, error: null };
}

export function apiGet<T>(path: string): Promise<CallResult<T>> {
    return call<T>(path);
}

export function apiPut<T>(path: string, payload: unknown): Promise<CallResult<T>> {
    return call<T>(path, { method: 'PUT', body: JSON.stringify(payload) });
}
export function apiPost<T>(path: string, payload: unknown): Promise<CallResult<T>> {
    return call<T>(path, { method: 'POST', body: JSON.stringify(payload) });
}

export function apiPostHeaders<T>(
    path: string,
    headers: Record<string, string>,
): Promise<CallResult<T>> {
    return call<T>(path, { method: 'POST', headers });
}
export function apiPatch<T>(path: string, payload: unknown): Promise<CallResult<T>> {
    return call<T>(path, { method: 'PATCH', body: JSON.stringify(payload) });
}
export function apiUpload<T>(path: string, form: FormData): Promise<CallResult<T>> {
    return call<T>(path, { method: 'POST', body: form });
}