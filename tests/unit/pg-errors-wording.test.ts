import { describe, it, expect } from 'vitest';
import { clientFault } from '@/lib/data/pg-errors';

// createProject passed "That design is not available any more" for every fault clientFault
// recognises. A slug arriving where the column wants a uuid is 22P02, not a missing row, but
// it said the design was gone -- which is what sent us looking at an empty templates table
// that had 118 rows in it.

const err = (code: string) => ({ code, message: `db said ${code}` });
const DESIGN = 'That design is not available any more.';

describe('clientFault wording', () => {
    it('uses the caller\'s words when the thing really is missing', () => {
        expect(clientFault(err('23503'), DESIGN)?.message).toBe(DESIGN);
    });

    it('does not claim a missing design when the id was malformed', () => {
        const said = clientFault(err('22P02'), DESIGN)?.message;

        expect(said).not.toBe(DESIGN);
        expect(said).toMatch(/address is not valid/i);
    });

    it('does not claim a missing design for a duplicate, a check, or an overlong value', () => {
        for (const code of ['23505', '23514', '22001']) {
            expect(clientFault(err(code), DESIGN)?.message).not.toBe(DESIGN);
        }
    });

    it('still maps every fault to validation_failed, never internal', () => {
        for (const code of ['23503', '23505', '23514', '22001', '22P02']) {
            expect(clientFault(err(code), DESIGN)?.code).toBe('validation_failed');
        }
    });

    it('lets a caller reword one fault at a time', () => {
        const said = clientFault(err('23505'), { '23505': 'You already have a site by that name.' });

        expect(said?.message).toBe('You already have a site by that name.');
    });

    it('leaves faults it does not recognise alone, so they stay internal', () => {
        expect(clientFault({ code: '42P01', message: 'relation does not exist' }, DESIGN)).toBeNull();
    });

    it('still reads the message when a driver gives no code', () => {
        const said = clientFault({ message: 'violates foreign key constraint' }, DESIGN);

        expect(said?.message).toBe(DESIGN);
    });
});
