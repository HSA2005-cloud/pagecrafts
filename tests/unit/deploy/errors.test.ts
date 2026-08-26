import { describe, it, expect } from 'vitest';
import { toPublishError, notEntitled } from '@/lib/deploy/errors';
import { reasonForError } from '@/lib/deploy/failure';

describe('publish errors', () => {
    it('turns any failure into hosting_error with a readable message', () => {
        const err = toPublishError('pushing', new Error('422 Unprocessable Entity'));
        expect(err.code).toBe('hosting_error');
        expect(err.message).toBe('We could not upload your site files.');
        expect(err.detail).toContain('422');
    });

    it('leaves an existing publish error alone', () => {
        const original = notEntitled();
        expect(toPublishError('pushing', original)).toBe(original);
    });

    it('uses the frozen payment code for the entitlement gate', () => {
        expect(notEntitled().code).toBe('payment_required');
    });

    it('never puts a provider status code in the customer message', () => {
        const err = toPublishError('verifying', new Error('500 Internal Server Error'));
        expect(err.message).not.toMatch(/\d{3}/);
    });

    it('maps missing deploy credentials to a provisioning failure', () => {
        expect(reasonForError(new Error('Deploy credential is not configured'))).toBe(
            'provisioning_failed',
        );
        expect(reasonForError(new Error('Missing environment variable: HOSTING_API_BASE'))).toBe(
            'provisioning_failed',
        );
    });
});
