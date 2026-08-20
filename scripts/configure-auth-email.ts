#!/usr/bin/env tsx
/**
 * Auth email: SMTP + the confirm redirect URL.
 *
 * Hosted Supabase will not deliver confirmation or reset mail on the built-in
 * sender for long. The dashboard path this encodes is:
 *
 *   Authentication → Emails → SMTP   (Resend, SendGrid, or Amazon SES)
 *   Authentication → URL Configuration → Redirect URLs
 *     add {APP_URL}/api/v1/auth/confirm
 *
 * Locally the allow-list lives in supabase/config.toml (restart the stack after
 * changing it). This script prints the same values, and with a management token
 * it applies them to the hosted project.
 *
 *   npm run auth:email
 *   npm run auth:email -- --apply
 */

import { smtpSettingsFrom, type SmtpSettings } from '../src/lib/auth/smtp';
import {
    authConfirmUrl,
    authRedirectAllowList,
    localAuthRedirectAllowList,
} from '../src/lib/auth/email-urls';

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const confirm = authConfirmUrl(appUrl, '/new');
const allow = process.env.NEXT_PUBLIC_APP_URL
    ? authRedirectAllowList(appUrl)
    : localAuthRedirectAllowList();

function printPlan(smtp: SmtpSettings | undefined): void {
    console.log(`Site URL:        ${appUrl}`);
    console.log(`Confirm URL:     ${confirm}`);
    console.log('');
    console.log('Authentication → URL Configuration → Redirect URLs');
    for (const url of allow) console.log(`  ${url}`);
    console.log('');

    if (!smtp) {
        console.log('Authentication → Emails → SMTP');
        console.log('  not set. Local mail stays in Inbucket (http://127.0.0.1:54324).');
        console.log('  Set SMTP_PROVIDER=resend|sendgrid|ses plus SMTP_PASS and SMTP_ADMIN_EMAIL.');
        return;
    }

    console.log(`Authentication → Emails → SMTP  (${smtp.provider})`);
    console.log(`  host         ${smtp.host}`);
    console.log(`  port         ${smtp.port}`);
    console.log(`  user         ${smtp.user}`);
    console.log(`  sender       ${smtp.senderName} <${smtp.adminEmail}>`);
}

async function applyHosted(smtp: SmtpSettings | undefined): Promise<void> {
    const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
    const ref = process.env.SUPABASE_PROJECT_REF?.trim();

    if (!token || !ref) {
        throw new Error(
            '--apply needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF '
            + '(the hosted project, not local).',
        );
    }

    const body: Record<string, unknown> = {
        site_url: appUrl,
        uri_allow_list: allow.join(','),
        external_email_enabled: true,
    };

    if (smtp) {
        body.smtp_host = smtp.host;
        body.smtp_port = String(smtp.port);
        body.smtp_user = smtp.user;
        body.smtp_pass = smtp.pass;
        body.smtp_admin_email = smtp.adminEmail;
        body.smtp_sender_name = smtp.senderName;
    }

    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supabase auth config update failed (${response.status}): ${text}`);
    }

    console.log('');
    console.log(`Applied to project ${ref}.`);
}

async function main(): Promise<void> {
    const apply = process.argv.includes('--apply');
    const smtp = smtpSettingsFrom(process.env);

    printPlan(smtp);

    if (apply) {
        await applyHosted(smtp);
        return;
    }

    console.log('');
    console.log('Dry run. Re-run with --apply to push to a linked hosted project.');
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
