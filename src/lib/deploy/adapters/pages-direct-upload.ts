import 'server-only';
import { extname, basename } from 'node:path';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { PublishFile } from '@/lib/contracts/deploy';
import { deployConfig } from '../config';
import { readDeployCredential, redact } from '../credentials';
import { HostingError } from './hosting-error';
import { accountPath } from './cloudflare-client';

/**
 * Cloudflare Pages Direct Upload — same flow wrangler uses, without shelling out.
 *
 * Hash formula matches wrangler: blake3(base64(contents) + extension).hex.slice(0, 32).
 */

const MAX_BUCKET_BYTES = 50 * 1024 * 1024;
const MAX_BUCKET_FILES = 100;
const QUICK_MS = 20_000;
const UPLOAD_MS = 45_000;
const ORIGIN_MS = 2_500;
/** Special Pages config files travel on the deployment form, not the asset store. */
const FORM_ONLY = new Set(['_headers', '_redirects', '_routes.json']);

interface PreparedFile {
    path: string;
    hash: string;
    base64: string;
    contentType: string;
    sizeInBytes: number;
    bytes: Buffer;
}

interface CfEnvelope<T> {
    success: boolean;
    result: T;
    errors?: { code: number; message: string }[];
}

interface Stage {
    name?: string;
    status?: string;
}

export function pagesAssetHash(bytes: Buffer, filePath: string): string {
    const extension = extname(filePath).replace(/^\./, '');
    const payload = bytes.toString('base64') + extension;
    return bytesToHex(blake3(Buffer.from(payload, 'utf8'))).slice(0, 32);
}

export function pagesContentType(filePath: string): string {
    const ext = extname(filePath).slice(1).toLowerCase();
    const types: Record<string, string> = {
        html: 'text/html; charset=utf-8',
        htm: 'text/html; charset=utf-8',
        css: 'text/css; charset=utf-8',
        js: 'text/javascript; charset=utf-8',
        mjs: 'text/javascript; charset=utf-8',
        json: 'application/json',
        svg: 'image/svg+xml',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        ico: 'image/x-icon',
        woff: 'font/woff',
        woff2: 'font/woff2',
        txt: 'text/plain; charset=utf-8',
        xml: 'application/xml',
        map: 'application/json',
    };
    return types[ext] ?? 'application/octet-stream';
}

function normalizePath(path: string): string {
    return path.replace(/^\/+/, '').split('\\').join('/');
}

function prepareFiles(files: PublishFile[]): PreparedFile[] {
    return files.map((file) => {
        const path = normalizePath(file.path);
        const bytes =
            file.encoding === 'base64'
                ? Buffer.from(file.content, 'base64')
                : Buffer.from(file.content, 'utf8');
        return {
            path,
            hash: pagesAssetHash(bytes, path),
            base64: bytes.toString('base64'),
            contentType: pagesContentType(path),
            sizeInBytes: bytes.byteLength,
            bytes,
        };
    });
}

function isAbort(error: unknown): boolean {
    return (
        (error instanceof Error && error.name === 'TimeoutError') ||
        (error instanceof Error && error.name === 'AbortError') ||
        (typeof DOMException !== 'undefined' &&
            error instanceof DOMException &&
            (error.name === 'TimeoutError' || error.name === 'AbortError'))
    );
}

async function parseCf<T>(res: Response): Promise<T> {
    const payload = (await res.json().catch(() => null)) as CfEnvelope<T> | null;
    if (!res.ok || !payload?.success) {
        const err = payload?.errors?.[0];
        const message = err
            ? `${err.message}${err.code ? ` (${err.code})` : ''}`
            : res.statusText;
        throw new HostingError(redact(String(message)), res.status);
    }
    return payload.result;
}

async function apiFetch(
    path: string,
    init: RequestInit & { token: string; timeoutMs?: number },
): Promise<Response> {
    const { token, timeoutMs = QUICK_MS, body, method = 'GET', headers: extra } = init;
    const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        ...(extra as Record<string, string> | undefined),
    };
    if (body !== undefined && !(body instanceof FormData)) {
        headers['content-type'] = 'application/json';
    }

    try {
        return await fetch(`${deployConfig().apiBase}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : body,
            cache: 'no-store',
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        if (isAbort(error)) {
            throw new HostingError('Host upload timed out. Try publishing again.', 504);
        }
        throw error;
    }
}

async function apiJson<T>(
    path: string,
    init: RequestInit & { token: string; timeoutMs?: number },
): Promise<T> {
    return parseCf<T>(await apiFetch(path, init));
}

async function uploadToken(projectName: string): Promise<string> {
    const result = await apiJson<{ jwt: string }>(
        accountPath(`/pages/projects/${projectName}/upload-token`),
        {
            method: 'GET',
            token: readDeployCredential(),
        },
    );
    if (!result?.jwt) {
        throw new HostingError('Host did not return an upload token.', 502);
    }
    return result.jwt;
}

function bucketFiles(files: PreparedFile[]): PreparedFile[][] {
    const missing = [...files].sort((a, b) => b.sizeInBytes - a.sizeInBytes);
    const buckets: { files: PreparedFile[]; remaining: number }[] = [
        { files: [], remaining: MAX_BUCKET_BYTES },
    ];

    for (const file of missing) {
        let placed = false;
        for (const bucket of buckets) {
            if (
                bucket.remaining >= file.sizeInBytes &&
                bucket.files.length < MAX_BUCKET_FILES
            ) {
                bucket.files.push(file);
                bucket.remaining -= file.sizeInBytes;
                placed = true;
                break;
            }
        }
        if (!placed) {
            buckets.push({
                files: [file],
                remaining: MAX_BUCKET_BYTES - file.sizeInBytes,
            });
        }
    }

    return buckets.map((b) => b.files).filter((files) => files.length > 0);
}

function stageDone(stage: Stage | undefined): 'success' | 'failure' | null {
    if (!stage?.status) return null;
    if (stage.status === 'success') return 'success';
    if (stage.status === 'failure' || stage.status === 'canceled') return 'failure';
    return null;
}

async function originAnswers(url: string): Promise<boolean> {
    try {
        const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            cache: 'no-store',
            signal: AbortSignal.timeout(ORIGIN_MS),
        });
        if (res.status === 522 || res.status === 530) return false;
        return res.status > 0 && res.status < 500;
    } catch {
        return false;
    }
}

async function anyOrigin(...urls: string[]): Promise<boolean> {
    const unique = [...new Set(urls.filter(Boolean))];
    if (unique.length === 0) return false;
    const results = await Promise.all(unique.map((u) => originAnswers(u)));
    return results.some(Boolean);
}

async function uploadBucket(jwt: string, bucket: PreparedFile[]): Promise<void> {
    await apiJson('/pages/assets/upload', {
        method: 'POST',
        token: jwt,
        timeoutMs: UPLOAD_MS,
        body: JSON.stringify(
            bucket.map((file) => ({
                key: file.hash,
                value: file.base64,
                metadata: { contentType: file.contentType },
                base64: true,
            })),
        ),
    });
}

/**
 * Upload static files and create a Pages production deployment.
 * Returns a short id suitable for `commitSha` (deployment id or preview hash).
 */
export async function pushPagesDirectUpload(
    projectName: string,
    files: PublishFile[],
): Promise<{ commitSha: string }> {
    if (files.length === 0) {
        throw new HostingError('No files to publish.', 400);
    }

    const prepared = prepareFiles(files);
    const assets = prepared.filter((f) => !FORM_ONLY.has(basename(f.path)));
    const formOnly = prepared.filter((f) => FORM_ONLY.has(basename(f.path)));

    if (assets.length === 0) {
        throw new HostingError('No site files to publish.', 400);
    }

    const manifest = Object.fromEntries(
        assets.map((file) => [`/${file.path}`, file.hash]),
    );

    let jwt = await uploadToken(projectName);

    // Trust check-missing for speed on republish. confirmDeployment still refuses
    // empty origins if the create somehow references missing hashes.
    let toUpload = assets;
    try {
        const missingRaw = await apiJson<unknown>('/pages/assets/check-missing', {
            method: 'POST',
            token: jwt,
            body: JSON.stringify({ hashes: assets.map((f) => f.hash) }),
        });
        if (Array.isArray(missingRaw)) {
            const missing = new Set(
                missingRaw.filter((h): h is string => typeof h === 'string'),
            );
            toUpload = assets.filter((f) => missing.has(f.hash));
        }
    } catch {
        toUpload = assets;
    }

    const buckets = bucketFiles(toUpload);
    const concurrency = 3;
    for (let i = 0; i < buckets.length; i += concurrency) {
        const batch = buckets.slice(i, i + concurrency);
        await Promise.all(
            batch.map(async (bucket) => {
                let attempts = 0;
                for (;;) {
                    try {
                        await uploadBucket(jwt, bucket);
                        return;
                    } catch (error) {
                        attempts += 1;
                        if (
                            error instanceof HostingError &&
                            (error.status === 401 || error.status === 403) &&
                            attempts < 3
                        ) {
                            jwt = await uploadToken(projectName);
                            continue;
                        }
                        if (
                            attempts < 3 &&
                            !(error instanceof HostingError && error.status < 500)
                        ) {
                            await new Promise((r) => setTimeout(r, 400 * attempts));
                            continue;
                        }
                        throw error;
                    }
                }
            }),
        );
    }

    // Cache hint only — do not block the deployment create on it.
    void apiJson('/pages/assets/upsert-hashes', {
        method: 'POST',
        token: jwt,
        body: JSON.stringify({ hashes: assets.map((f) => f.hash) }),
    }).catch(() => undefined);

    const form = new FormData();
    form.append('manifest', JSON.stringify(manifest));
    form.append('branch', 'main');
    for (const file of formOnly) {
        form.append(
            basename(file.path),
            new File([Uint8Array.from(file.bytes)], basename(file.path)),
        );
    }

    const res = await apiFetch(
        accountPath(`/pages/projects/${projectName}/deployments`),
        {
            method: 'POST',
            token: readDeployCredential(),
            timeoutMs: UPLOAD_MS,
            body: form,
        },
    );

    const deployment = await parseCf<{
        id: string;
        url?: string;
        latest_stage?: Stage;
    }>(res);
    if (!deployment.id) {
        throw new HostingError('Host created a deployment without an id.', 502);
    }

    await confirmDeployment(projectName, deployment);

    return {
        commitSha:
            deployment.id.slice(0, 8) ||
            /https:\/\/([0-9a-f]{8})\./.exec(deployment.url ?? '')?.[1] ||
            'deployed',
    };
}

async function confirmDeployment(
    projectName: string,
    created: { id: string; url?: string; latest_stage?: Stage },
): Promise<void> {
    const pagesUrl = `https://${projectName}.pages.dev/`;
    const deploymentUrl = created.url ?? pagesUrl;
    const token = readDeployCredential();

    if (stageDone(created.latest_stage) === 'failure') {
        throw new HostingError(
            'Host rejected the deployment after upload. Try publishing again.',
            502,
        );
    }

    // Create often returns deploy-stage success already — do not burn seconds probing.
    if (stageDone(created.latest_stage) === 'success') {
        if (await anyOrigin(pagesUrl, deploymentUrl)) return;
        // Stage says success; edge may still be warming. Proceed — enableHosting next.
        return;
    }

    let latest = created.latest_stage;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (await anyOrigin(pagesUrl, deploymentUrl)) return;

        try {
            const deployment = await apiJson<{
                url?: string;
                latest_stage?: Stage;
            }>(accountPath(`/pages/projects/${projectName}/deployments/${created.id}`), {
                method: 'GET',
                token,
            });
            latest = deployment.latest_stage;
            const done = stageDone(latest);
            if (done === 'success') return;
            if (done === 'failure') {
                throw new HostingError(
                    'Host rejected the deployment after upload. Try publishing again.',
                    502,
                );
            }
        } catch (error) {
            if (error instanceof HostingError && error.status === 502) throw error;
        }

        await new Promise((r) => setTimeout(r, 500));
    }

    if (await anyOrigin(pagesUrl, deploymentUrl)) return;
    if (stageDone(latest) === 'success') return;

    throw new HostingError(
        'Host uploaded the site but the preview address is not answering yet. Try publishing again.',
        504,
    );
}
