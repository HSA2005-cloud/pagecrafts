import { describe, expect, it } from 'vitest';

import {
    confirmedPages,
    planLocksConfirmedPages,
    PAGE_LOCKED_MESSAGE,
} from '@/lib/data/page-locks';

// The walkthrough steps through a generated site a page at a time: change what you want,
// press Confirm, move on. On Starter that is final — the page cannot be written again
// without upgrading.
//
// The rule is server-side because a lock enforced in the browser is not a lock. The editor,
// Ask and anything else pointed at the API all reach PUT /files, and all of them have to
// hear the same answer.

describe('who can go back', () => {
    it('holds Starter to a confirmed page', () => {
        expect(planLocksConfirmedPages('starter')).toBe(true);
    });

    it('lets a paid plan revisit', () => {
        expect(planLocksConfirmedPages('pro')).toBe(false);
        expect(planLocksConfirmedPages('premium')).toBe(false);
    });

    // A plan name nobody recognises must not open the gate. Fail towards the lock: an
    // over-eager lock is a support message, an over-eager unlock is a promise broken.
    it('treats an unknown plan as Starter', () => {
        expect(planLocksConfirmedPages('')).toBe(true);
        expect(planLocksConfirmedPages('trial')).toBe(true);
    });
});

describe('reading the confirmed list out of site_meta', () => {
    it('reads what was written', () => {
        expect(confirmedPages({ confirmedPages: ['index.html', 'about.html'] }))
            .toEqual(['index.html', 'about.html']);
    });

    it('is empty for a project that has never been through it', () => {
        expect(confirmedPages({})).toEqual([]);
        expect(confirmedPages(null)).toEqual([]);
        expect(confirmedPages(undefined)).toEqual([]);
    });

    // site_meta is a JSON column: anything could be in there from an older shape or a bad
    // write, and a crash while reading it would take the editor down with it.
    it('survives a column holding something else entirely', () => {
        expect(confirmedPages({ confirmedPages: 'index.html' })).toEqual([]);
        expect(confirmedPages({ confirmedPages: [1, 2, null] })).toEqual([]);
        expect(confirmedPages('not an object')).toEqual([]);
        expect(confirmedPages([])).toEqual([]);
    });

    it('keeps the strings and drops the rest of a mixed list', () => {
        expect(confirmedPages({ confirmedPages: ['index.html', 7, null, 'about.html'] }))
            .toEqual(['index.html', 'about.html']);
    });

    it('does not repeat a page confirmed twice', () => {
        expect(confirmedPages({ confirmedPages: ['index.html', 'index.html'] }))
            .toEqual(['index.html']);
    });
});

describe('what the person is told', () => {
    // "payment_required" with this sentence — it says what happened, that it was their
    // choice, and the way out. Not "forbidden", which reads like a fault.
    it('names the plan and the way out', () => {
        expect(PAGE_LOCKED_MESSAGE).toMatch(/free plan/i);
        expect(PAGE_LOCKED_MESSAGE).toMatch(/upgrade/i);
        expect(PAGE_LOCKED_MESSAGE).toMatch(/confirmed/i);
    });
});
