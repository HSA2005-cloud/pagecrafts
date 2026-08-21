import { describe, it, expect } from 'vitest';
import { securityHeaders, contentSecurityPolicy, NO_STORE } from '@/lib/security/headers';

const find = (isDev: boolean, key: string) =>
    securityHeaders(isDev).find((h) => h.key === key)?.value;

describe('security headers (NFR-110, NFR-113)', () => {
    it('sends HSTS in production and never in development', () => {
        expect(find(false, 'Strict-Transport-Security')).toContain('max-age=63072000');
        expect(find(true, 'Strict-Transport-Security')).toBeUndefined();
    });

    it('refuses sniffing and framing', () => {
        expect(find(false, 'X-Content-Type-Options')).toBe('nosniff');
        expect(find(false, 'X-Frame-Options')).toBe('DENY');
        expect(contentSecurityPolicy(false)).toContain("frame-ancestors 'none'");
    });

    it('does not leak the full URL to another origin', () => {
        expect(find(false, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    it('turns off hardware the product never uses, except the mic on the brief', () => {
        const policy = find(false, 'Permissions-Policy') ?? '';

        expect(policy).toContain('camera=()');
        expect(policy).toContain('geolocation=()');
        expect(policy).toContain('microphone=(self)');
        expect(policy).not.toMatch(/microphone=\(\)/);
    });

    it('never allows eval in production', () => {
        expect(contentSecurityPolicy(false)).not.toContain('unsafe-eval');
        expect(contentSecurityPolicy(true)).toContain('unsafe-eval');
    });

    it('locks down the dangerous fallbacks', () => {
        const policy = contentSecurityPolicy(false);

        expect(policy).toContain("default-src 'self'");
        expect(policy).toContain("object-src 'none'");
        expect(policy).toContain("base-uri 'self'");
        expect(policy).toContain("form-action 'self' https:");
        expect(policy).toContain('https://api.razorpay.com');
        expect(policy).toContain('https://checkout.razorpay.com');
        expect(policy).toContain('https://cdn.razorpay.com');
    });

    it('lets Razorpay open the card 3DS window instead of about:blank', () => {
        expect(find(false, 'Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');
    });

    it('still allows the image sources the gallery actually uses', () => {
        expect(contentSecurityPolicy(false)).toContain('https://images.unsplash.com');
    });

    it('upgrades any plain http subresource', () => {
        expect(contentSecurityPolicy(false)).toContain('upgrade-insecure-requests');
    });

    it('never lets an API answer be cached', () => {
        expect(NO_STORE.find((h) => h.key === 'Cache-Control')?.value).toContain('no-store');
    });
});
