import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
    authCallbackUrl,
    authConfirmUrl,
    localAuthRedirectAllowList,
} from '@/lib/auth/email-urls';
import { smtpSettingsFrom } from '@/lib/auth/smtp';

const CONFIG = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');

function quotedUrls(block: string): string[] {
    return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('auth email redirects', () => {
    it('every URL the app sends is on the local GoTrue allow-list', () => {
        const match = CONFIG.match(/additional_redirect_urls\s*=\s*\[([\s\S]*?)\]/);
        expect(match, 'additional_redirect_urls missing from supabase/config.toml').toBeTruthy();

        const listed = new Set(quotedUrls(match![1]));
        const required = localAuthRedirectAllowList();

        expect(listed.size).toBeGreaterThan(0);
        for (const url of required) {
            expect(listed.has(url), `missing from additional_redirect_urls: ${url}`).toBe(true);
        }
    });

    it('site_url matches the app origin used in .env.local', () => {
        expect(CONFIG).toMatch(/site_url\s*=\s*"http:\/\/localhost:3000"/);
    });

    it('builds the confirm and callback URLs the routes send', () => {
        expect(authConfirmUrl('http://localhost:3000', '/new'))
            .toBe('http://localhost:3000/api/v1/auth/confirm?next=/new');
        expect(authConfirmUrl('http://localhost:3000/', '/reset'))
            .toBe('http://localhost:3000/api/v1/auth/confirm?next=/reset');
        expect(authCallbackUrl('http://localhost:3000', '/'))
            .toBe('http://localhost:3000/api/v1/auth/callback?next=%2F');
    });

    it('refuses to build a redirect with no app URL', () => {
        expect(() => authConfirmUrl('', '/new')).toThrow(/NEXT_PUBLIC_APP_URL/);
    });
});

describe('SMTP presets', () => {
    it('maps Resend, SendGrid and SES to their SMTP endpoints', () => {
        expect(smtpSettingsFrom({
            SMTP_PROVIDER: 'resend', SMTP_PASS: 're_test', SMTP_ADMIN_EMAIL: 'a@b.c',
        })).toMatchObject({ host: 'smtp.resend.com', port: 465, user: 'resend' });

        expect(smtpSettingsFrom({
            SMTP_PROVIDER: 'sendgrid', SMTP_PASS: 'SG.test', SMTP_ADMIN_EMAIL: 'a@b.c',
        })).toMatchObject({ host: 'smtp.sendgrid.net', port: 587, user: 'apikey' });

        expect(smtpSettingsFrom({
            SMTP_PROVIDER: 'ses', SMTP_PASS: 'ses-pass', SMTP_USER: 'AKIA',
            SMTP_ADMIN_EMAIL: 'a@b.c', SMTP_SES_REGION: 'us-east-1',
        })).toMatchObject({
            host: 'email-smtp.us-east-1.amazonaws.com', port: 587, user: 'AKIA',
        });
    });

    it('is silent when SMTP is not configured, loud when it is half-configured', () => {
        expect(smtpSettingsFrom({})).toBeUndefined();
        expect(() => smtpSettingsFrom({ SMTP_PROVIDER: 'resend' })).toThrow(/SMTP_PASS/);
        expect(() => smtpSettingsFrom({
            SMTP_PROVIDER: 'ses', SMTP_PASS: 'x', SMTP_ADMIN_EMAIL: 'a@b.c',
        })).toThrow(/SMTP_USER/);
    });
});

const signUp = vi.fn();

vi.mock('@/lib/auth/server', () => ({
    supabaseRouteClient: async () => ({ auth: { signUp } }),
}));

describe('signup sends the confirm redirect', () => {
    beforeEach(() => signUp.mockReset());

    it('points emailRedirectTo at /api/v1/auth/confirm', async () => {
        signUp.mockResolvedValue({
            data: { user: { id: 'u1', email: 'a@b.c' }, session: null },
            error: null,
        });

        const { POST } = await import('@/app/api/v1/auth/signup/route');
        await POST(new Request('http://localhost/api/v1/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'someone@pagecraft.in', password: 'TestPass123!zz' }),
        }) as never);

        expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
            options: expect.objectContaining({
                emailRedirectTo: 'http://localhost:3000/api/v1/auth/confirm?next=/new',
            }),
        }));
    });
});
