import 'server-only';
import { deployConfig } from '../config';
import { readDeployCredential, redact } from '../credentials';
import { HostingError } from './hosting-error';

interface CfResponse<T> {
    success: boolean;
    result: T;
    errors?: { code: number; message: string }[];
}

export async function cf<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
): Promise<T> {
    const headers: Record<string, string> = {
        authorization: `Bearer ${readDeployCredential()}`,
    };
    if (body !== undefined) {
        headers['content-type'] = 'application/json';
    }

    const res = await fetch(`${deployConfig().apiBase}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(45_000),
    });

    const payload = (await res.json().catch(() => null)) as CfResponse<T> | null;

    if (!res.ok || !payload?.success) {
        const message = payload?.errors?.[0]?.message ?? res.statusText;
        throw new HostingError(redact(String(message)), res.status);
    }

    return payload.result;
}

export function accountPath(suffix: string): string {
    return `/accounts/${deployConfig().accountId}${suffix}`;
}