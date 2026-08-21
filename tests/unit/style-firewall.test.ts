import { describe, expect, it } from 'vitest';

import {
    classifyUpgradeIntent,
    currentStyleTier,
    styleUpgradeFirewall,
    upgradeBlockedMessage,
} from '@/lib/editor/style-firewall';
import { SCHEMA_VERSION, type Composition } from '@/lib/contracts';

const starterHtml = `<html><body data-style="casual" data-chrome="sidebar"><aside class="site-sidebar"></aside></body></html>`;
const proHtml = `<html><body data-style="photos" data-chrome="topbar"><header class="site-topbar-blend"></header></body></html>`;
const premiumHtml = `<html><body data-style="motion" data-chrome="liquid" class="site-liquid"></body></html>`;

const freeComposition = {
    schemaVersion: SCHEMA_VERSION,
    vertical: 'cafe',
    artDirection: {
        themeId: 'sunlit-craft',
        motionId: 'none',
        radiusId: 'soft',
        spacingId: 'default',
        imageryId: 'bright-clean',
    },
    meta: { title: 'Test', description: '', lang: 'en' },
    sections: [],
} as Composition;

describe('style upgrade firewall classifier', () => {
    it('rejects Pro and Premium asks from free/Starter wording', () => {
        expect(classifyUpgradeIntent('make it look like Pro')).toBe('pro');
        expect(classifyUpgradeIntent('upgrade to Premium')).toBe('premium');
        expect(classifyUpgradeIntent('add liquid glass and continuous scroll')).toBe('premium');
        expect(classifyUpgradeIntent('use a blended floating top bar')).toBe('pro');
        expect(classifyUpgradeIntent('make my background look like this photo')).toBe('pro');
        expect(classifyUpgradeIntent('kinetic glow bloom premium look')).toBe('premium');
        expect(classifyUpgradeIntent('PageCrafts-like landing atmosphere')).toBe('premium');
    });

    it('allows ordinary copy and colour edits', () => {
        expect(classifyUpgradeIntent('Change the headline to Fresh coffee daily')).toBeNull();
        expect(classifyUpgradeIntent('Rename the shop to Meera Cafe')).toBeNull();
        expect(classifyUpgradeIntent('Make the button teal')).toBeNull();
        expect(classifyUpgradeIntent('Move About above Contact')).toBeNull();
        expect(classifyUpgradeIntent('Add a FAQ section')).toBeNull();
    });

    it('detects current tier from HTML chrome / data-style', () => {
        expect(currentStyleTier({ html: starterHtml })).toBe('free');
        expect(currentStyleTier({ html: proHtml })).toBe('pro');
        expect(currentStyleTier({ html: premiumHtml })).toBe('premium');
        expect(currentStyleTier({ composition: freeComposition })).toBe('free');
    });

    it('blocks free users from Pro and Premium upgrades', () => {
        const proBlock = styleUpgradeFirewall({
            instruction: 'Make a blended floating top bar like Pro',
            html: starterHtml,
            composition: freeComposition,
        });
        expect(proBlock).toMatch(/Pro/);
        expect(proBlock).toMatch(/Starter/);

        const premiumBlock = styleUpgradeFirewall({
            instruction: 'Add liquid display continuous scroll',
            html: starterHtml,
        });
        expect(premiumBlock).toMatch(/Premium/);
        expect(premiumBlock).not.toMatch(/silently/);
    });

    it('blocks Pro users from Premium-only asks but allows Pro asks', () => {
        expect(
            styleUpgradeFirewall({
                instruction: 'Add more cinematic photo backgrounds',
                html: proHtml,
            }),
        ).toBeNull();

        const blocked = styleUpgradeFirewall({
            instruction: 'Switch to continuous scroll liquid deck',
            html: proHtml,
        });
        expect(blocked).toMatch(/Premium/);
        expect(upgradeBlockedMessage('premium', 'pro')).toMatch(/Premium/);
    });

    it('allows Premium sites to request Premium traits', () => {
        expect(
            styleUpgradeFirewall({
                instruction: 'More liquid glass bloom atmosphere',
                html: premiumHtml,
            }),
        ).toBeNull();
    });
});
