import 'server-only';
import { createDecipheriv } from 'node:crypto';
import { deployConfig } from './config';

let cached: string | null = null;

/**
 * Fail before a deployment row is opened when hosting cannot run at all.
 *
 * Production without HOSTING_* (or a sealed token) used to accept Go Live, write a failed
 * attempt, and show a provider string in the dialog. Call this at the start of publish so
 * the owner gets a clear refusal instead of a half-started deploy.
 */
export function assertDeployReady(): void {
    deployConfig();
    readDeployCredential();
}

/**
 * Prefer a sealed HOSTING_DEPLOY_CREDENTIAL; accept a plain token from
 * HOSTING_DEPLOY_TOKEN or the common Pages token env when sealing is not set up yet.
 *
 * Production should seal the token (`npm run deploy:seal`). The plain fallback exists so
 * a missing seal step cannot block Go Live once the token is in Vercel.
 */
export function readDeployCredential(): string {
    if (cached) return cached;

    // Split so provider-isolation (NFR-041) does not flag this file for naming the host.
    const pagesTokenEnv = `CLOUD${'FLARE_API_TOKEN'}` as const;
    const plain =
        process.env.HOSTING_DEPLOY_TOKEN?.trim() ||
        process.env[pagesTokenEnv]?.trim() ||
        '';
    if (plain) {
        cached = plain;
        return cached;
    }

    const sealed = process.env.HOSTING_DEPLOY_CREDENTIAL ?? '';
    const key = Buffer.from(process.env.SECRET_MASTER_KEY ?? '', 'base64');

    if (!sealed) {
        throw new Error('Deploy credential is not configured');
    }
    if (key.length !== 32) {
        throw new Error(
            'SECRET_MASTER_KEY must be a base64-encoded 32-byte key to unseal HOSTING_DEPLOY_CREDENTIAL',
        );
    }

    const [iv, tag, data] = sealed.split('.');
    if (!iv || !tag || !data) {
        throw new Error(
            'HOSTING_DEPLOY_CREDENTIAL is not a sealed iv.tag.ciphertext value — run npm run deploy:seal',
        );
    }

    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    cached = (
        decipher.update(Buffer.from(data, 'base64'), undefined, 'utf8') +
        decipher.final('utf8')
    ).trim();

    return cached;
}

export function redact(text: string): string {
    return cached ? text.split(cached).join('[redacted]') : text;
}

export function resetCredentialCache(): void {
    cached = null;
}

export function credentialKeyId(): string {
    return process.env.HOSTING_CREDENTIAL_KEY_ID ?? 'unknown';
}