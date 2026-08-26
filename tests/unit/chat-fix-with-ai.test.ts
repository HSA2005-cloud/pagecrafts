import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    explainCreationIssue,
    lastRetryableChatInstruction,
} from '@/lib/editor/ai-fix';

const SOFT =
    'We could not finish that just now. Your work is safe in this tab — try again in a moment.';

describe('chat Fix with AI', () => {
    it('does not put the soft-failure sentence into the retry instruction', () => {
        const issue = explainCreationIssue(SOFT, 'chat');
        expect(issue.title).toMatch(/did not go through/i);
        expect(issue.instruction).not.toBe(SOFT);
        expect(issue.instruction).not.toMatch(/safe in this tab/i);
    });

    it('retries the last real user request, skipping echoed soft-failures', () => {
        const hero =
            'Rewrite the hero heading so it names the business and what it sells.';
        expect(
            lastRetryableChatInstruction(
                [
                    { role: 'user', text: hero },
                    { role: 'user', text: SOFT },
                ],
                SOFT,
            ),
        ).toBe(hero);
    });

    it('ChatPanel sends the retryable user text, not fix.instruction', () => {
        const panel = readFileSync(
            join(process.cwd(), 'src/components/editor/ChatPanel.tsx'),
            'utf8',
        );
        expect(panel).toContain('lastRetryableChatInstruction');
        expect(panel).toContain('void send(retryInstruction)');
        expect(panel).not.toContain('void send(fix.instruction)');
    });
});
