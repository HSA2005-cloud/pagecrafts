import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mintPendingTicket, readPendingTicket } from '@/lib/auth/pending-signup';

const USER = '11111111-1111-1111-1111-111111111111';

beforeAll(() => {
    process.env.SECRET_MASTER_KEY = randomBytes(32).toString('base64');
});

describe('the pending-signup ticket', () => {
    it('round-trips the user it was minted for', () => {
        const ticket = mintPendingTicket(USER);

        expect(ticket).toBeTruthy();
        expect(readPendingTicket(ticket!)?.userId).toBe(USER);
    });

    it('refuses a ticket whose payload was edited', () => {
        const ticket = mintPendingTicket(USER)!;
        const [payload, signature] = ticket.split('.');

        const forged = Buffer.from(
            JSON.stringify({ userId: 'somebody-else', nonce: 'x', expiresAt: Date.now() + 60_000 }),
            'utf8',
        ).toString('base64url');

        expect(readPendingTicket(`${forged}.${signature}`)).toBeNull();
        expect(payload).not.toBe(forged);
    });

    it('refuses a ticket with no signature at all', () => {
        const ticket = mintPendingTicket(USER)!;

        expect(readPendingTicket(ticket.split('.')[0])).toBeNull();
    });

    it('refuses a ticket signed with a different key', () => {
        const ticket = mintPendingTicket(USER)!;
        const original = process.env.SECRET_MASTER_KEY;

        process.env.SECRET_MASTER_KEY = randomBytes(32).toString('base64');
        expect(readPendingTicket(ticket)).toBeNull();

        process.env.SECRET_MASTER_KEY = original;
    });

    it('refuses an expired ticket', () => {
        const past = Buffer.from(
            JSON.stringify({ userId: USER, nonce: 'x', expiresAt: Date.now() - 1 }),
            'utf8',
        ).toString('base64url');

        expect(readPendingTicket(past)).toBeNull();
    });

    it('refuses nonsense rather than throwing', () => {
        for (const value of ['', 'abc', 'a.b', '....', undefined]) {
            expect(readPendingTicket(value as string | undefined)).toBeNull();
        }
    });

    it('mints nothing when there is no master key, rather than an unsigned ticket', () => {
        const original = process.env.SECRET_MASTER_KEY;

        delete process.env.SECRET_MASTER_KEY;
        expect(mintPendingTicket(USER)).toBeNull();

        process.env.SECRET_MASTER_KEY = original;
    });

    it('gives two signups different tickets, so one cannot be replayed as another', () => {
        expect(mintPendingTicket(USER)).not.toBe(mintPendingTicket(USER));
    });
});
