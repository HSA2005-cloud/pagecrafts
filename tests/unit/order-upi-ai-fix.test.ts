import { describe, expect, it } from 'vitest';

import { explainCreationIssue, explainPreviewIssues } from '@/lib/editor/ai-fix';
import { isOrderTakingSite } from '@/lib/sites/order-taking';
import { renderPayPageHtml, wireHtmlPayLinks, wireOrderPayments } from '@/lib/sites/pay-page';
import { isValidUpiId, upiIssue, upiPayUri } from '@/lib/sites/upi';

describe('upi ids', () => {
    it('accepts common VPAs', () => {
        expect(isValidUpiId('meera@okaxis')).toBe(true);
        expect(isValidUpiId('9876543210@paytm')).toBe(true);
        expect(isValidUpiId('bad')).toBe(false);
        expect(upiIssue('')).toMatch(/Enter/);
    });

    it('builds a pay URI', () => {
        const uri = upiPayUri({
            upiId: 'Meera@OKAXIS',
            payeeName: 'Meera Sweets',
            amountInr: 499,
        });
        expect(uri).toContain('upi://pay?');
        expect(uri).toContain('pa=meera%40okaxis');
        expect(uri).toContain('am=499.00');
    });
});

describe('order-taking detection', () => {
    it('spots an order site from the brief', () => {
        expect(
            isOrderTakingSite({
                prompt: 'Order-taking website for a sweet shop with UPI checkout',
            }),
        ).toBe(true);
        expect(
            isOrderTakingSite({
                prompt: 'Portfolio for a photographer in Goa',
            }),
        ).toBe(false);
    });
});

describe('ai fix copy', () => {
    it('never returns a raw stylesheet path as the title', () => {
        const issue = explainCreationIssue('Missing stylesheet: styles.css', 'preview');
        expect(issue.title).toBe('This page is missing a file it needs');
        expect(issue.instruction.toLowerCase()).toContain('repair');
        expect(explainPreviewIssues(['Missing script: app.js']).kind).toBe('preview');
    });
});

describe('pay page', () => {
    it('renders the landing dark theme, not a white page', () => {
        const html = renderPayPageHtml({
            businessName: 'Meera Sweets',
            upiId: 'meera@okaxis',
            amountInr: 499,
        });
        expect(html).toContain('#05070a');
        expect(html).toContain('Pay with UPI');
        expect(html).not.toContain('background:#fff');
        expect(html).not.toContain('background: #ffffff');
    });

    it('wires order CTAs and adds pay.html', () => {
        const files = wireOrderPayments(
            {
                'index.html': '<a href="#">Order now</a>',
            },
            { businessName: 'Meera', upiId: 'meera@okaxis' },
        );
        expect(files['pay.html']).toContain('meera@okaxis');
        expect(files['index.html']).toContain('href="pay.html"');
        expect(wireHtmlPayLinks('<a>Order now</a>')).toContain('pay.html');
    });
});
