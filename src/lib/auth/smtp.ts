/**
 * SMTP presets for auth mail (confirmation, recovery, resend).
 *
 * Hosted Supabase's built-in sender is rate-limited and often never arrives.
 * The real path is Authentication → Emails → SMTP, pointed at Resend,
 * SendGrid, or Amazon SES. Locally, Inbucket stays the default until these
 * values are set — see `scripts/configure-auth-email.ts`.
 */

export const SMTP_PROVIDERS = ['resend', 'sendgrid', 'ses'] as const;
export type SmtpProvider = (typeof SMTP_PROVIDERS)[number];

export interface SmtpSettings {
    provider: SmtpProvider;
    host: string;
    port: number;
    user: string;
    pass: string;
    adminEmail: string;
    senderName: string;
}

const PRESETS: Record<SmtpProvider, { host: string; port: number; user: string }> = {
    resend: { host: 'smtp.resend.com', port: 465, user: 'resend' },
    sendgrid: { host: 'smtp.sendgrid.net', port: 587, user: 'apikey' },
    // Host is filled in from SMTP_SES_REGION; user is the SES SMTP username.
    ses: { host: 'email-smtp.ap-south-1.amazonaws.com', port: 587, user: '' },
};

export function parseSmtpProvider(raw: string | undefined): SmtpProvider | undefined {
    if (!raw) return undefined;
    const value = raw.trim().toLowerCase();
    return (SMTP_PROVIDERS as readonly string[]).includes(value)
        ? (value as SmtpProvider)
        : undefined;
}

export function smtpSettingsFrom(env: Record<string, string | undefined>): SmtpSettings | undefined {
    const provider = parseSmtpProvider(env.SMTP_PROVIDER);
    if (!provider) return undefined;

    const pass = env.SMTP_PASS?.trim();
    const adminEmail = env.SMTP_ADMIN_EMAIL?.trim();
    if (!pass) {
        throw new Error(`SMTP_PROVIDER=${provider} but SMTP_PASS is empty.`);
    }
    if (!adminEmail) {
        throw new Error(`SMTP_PROVIDER=${provider} but SMTP_ADMIN_EMAIL is empty.`);
    }

    const preset = PRESETS[provider];
    const region = env.SMTP_SES_REGION?.trim() || 'ap-south-1';
    const host = provider === 'ses' ? `email-smtp.${region}.amazonaws.com` : preset.host;
    const user = provider === 'ses'
        ? (env.SMTP_USER?.trim() ?? '')
        : (env.SMTP_USER?.trim() || preset.user);

    if (provider === 'ses' && !user) {
        throw new Error('SMTP_PROVIDER=ses requires SMTP_USER (the SES SMTP username).');
    }

    const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : preset.port;
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`SMTP_PORT must be a positive integer, got "${env.SMTP_PORT}".`);
    }

    return {
        provider,
        host,
        port,
        user,
        pass,
        adminEmail,
        senderName: env.SMTP_SENDER_NAME?.trim() || 'Pagecrafts',
    };
}
