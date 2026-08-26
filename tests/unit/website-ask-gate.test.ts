import { describe, expect, it } from 'vitest';

import {
    isLayoutOrVisualAsk,
    offTopicWebsiteAsk,
    shouldUsePageEdit,
} from '@/lib/editor/website-ask-gate';
import {
    applyPageEditPlan,
    sanitiseAskCss,
    upsertAskStyle,
} from '@/lib/ai/edit/rewrite-page';
import { explainCreationIssue } from '@/lib/editor/ai-fix';

describe('website ask gate', () => {
    it('rejects unrelated photo / Q&A asks', () => {
        expect(offTopicWebsiteAsk('Show me a photo of a lion')).toMatch(/only changes this website/i);
        expect(offTopicWebsiteAsk('What is the weather in Goa?')).toMatch(/only/i);
        expect(offTopicWebsiteAsk('Tell me a joke')).toMatch(/only/i);
    });

    it('allows website copy and layout asks', () => {
        expect(offTopicWebsiteAsk('Centre the hero and move it down a little')).toBeNull();
        expect(offTopicWebsiteAsk('Make the headline shorter')).toBeNull();
        expect(offTopicWebsiteAsk('Change the button colour to teal')).toBeNull();
        expect(offTopicWebsiteAsk('I just want the home page to be more centre staged')).toBeNull();
    });

    it('detects layout / visual intents', () => {
        expect(isLayoutOrVisualAsk('more centre staged')).toBe(true);
        expect(isLayoutOrVisualAsk("It's a little to the top")).toBe(true);
        expect(isLayoutOrVisualAsk('shorten the headline')).toBe(false);
        expect(shouldUsePageEdit("push the hero down", { hasEntryHtml: true })).toBe(true);
        expect(shouldUsePageEdit('shorten the headline', { hasEntryHtml: true })).toBe(true);
        expect(shouldUsePageEdit('centre the hero', { hasEntryHtml: false })).toBe(false);
    });
});

describe('page edit apply', () => {
    it('injects ask CSS into head and sanitises risky rules', () => {
        const html = '<!doctype html><html><head></head><body><h1>Hi</h1></body></html>';
        const next = upsertAskStyle(html, 'h1{text-align:center} @import url(x); expression(alert(1))');
        expect(next).toContain('data-pagecrafts-ask');
        expect(next).toContain('text-align:center');
        expect(sanitiseAskCss('@import url(evil); body{color:red}')).not.toMatch(/@import/);
        expect(next).not.toMatch(/expression/i);
    });

    it('applies exact replacements and CSS together', () => {
        const before = '<html><head></head><body><h1>Old</h1></body></html>';
        const after = applyPageEditPlan(before, {
            explanation: 'Centred the title.',
            css: 'h1{text-align:center;margin-top:4rem}',
            replacements: [{ find: '<h1>Old</h1>', replace: '<h1>New</h1>' }],
        });
        expect(after).toContain('<h1>New</h1>');
        expect(after).toContain('margin-top:4rem');
    });
});

describe('chat failure copy', () => {
    it('surfaces the exact reason instead of a generic line', () => {
        const issue = explainCreationIssue(
            'Ask only changes this website — copy, layout, colours, images on the page, and sections.',
            'chat',
        );
        expect(issue.what).toMatch(/only changes this website/i);
        expect(issue.what).not.toBe('The last request could not be turned into a suggestion.');
    });
});
