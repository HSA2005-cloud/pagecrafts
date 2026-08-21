import { describe, expect, it } from 'vitest';
import { friendlyPreviewIssue } from '@/lib/editor/preview-copy';

describe('friendly preview copy', () => {
    it('does not mention files or stylesheets', () => {
        expect(friendlyPreviewIssue('No index.html in this project.')).toBe(
            'Your site will show up here as you edit.',
        );
        expect(friendlyPreviewIssue('Missing stylesheet: styles.css')).toBe(
            'Part of the page could not be shown.',
        );
        expect(friendlyPreviewIssue('Missing script: app.js')).toBe(
            'Part of the page could not be shown.',
        );
        expect(friendlyPreviewIssue('This preview is too large to display safely.')).toBe(
            'This page is too large to preview.',
        );
    });

    it('still maps missing assets without jargon', () => {
        expect(friendlyPreviewIssue('Missing stylesheet: styles.css')).not.toMatch(/stylesheet/i);
    });
});
