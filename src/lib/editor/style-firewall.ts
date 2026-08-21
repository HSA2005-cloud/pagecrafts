import type { Composition } from '@/lib/contracts';
import type { StyleTier } from '@/lib/ai/generate/styles';

/**
 * Blocks free/Starter (and Pro) sites from AI-editing their way into a higher look.
 * Pure heuristics — unit-tested; gated before the LLM on client and server.
 */

export type UpgradeTarget = 'pro' | 'premium';

const PREMIUM_ONLY =
    /\b(liquid(\s|-)?(display|glass|deck|scroll)?|pagecrafts?\s*-?\s*like|bloom|continuous\s+scroll|scroll[\s-]?snap|page[\s-]?deck|glide\s+transition|page[\s-]*to[\s-]*page|kinetic|glow(\s+effect)?|neon\s+glow|aurora|vivid\s+energy|morph(\s+into)?|signature\s+look)\b/i;

const PRO_OR_HIGHER =
    /\b(photo[\s-]?rich|cinematic(\s+hero)?|full[\s-]?bleed(\s+photo)?|masonry\s+gallery|blended\s+(top\s*)?bar|floating\s+(top\s*)?bar|sticky\s+glass\s+nav|top\s*bar\s+that\s+blends|top\s+bar\s+blended|make\s+(my\s+)?background\s+look\s+like|paste[d]?\s+(this\s+)?(photo|image|picture)|background\s+(from\s+)?(this\s+)?(photo|image)|pro\s+look|premium\s+look|upgrade\s+(to|my)\s+(pro|premium)|make\s+it\s+(look\s+)?(like\s+)?(pro|premium)|look\s+like\s+(pro|premium)|animated\s+look|glassmorphism)\b/i;

const EXPLICIT_TIER =
    /\b(?:upgrade\s+to|switch\s+to|make\s+it|change\s+(?:it|this|the\s+site)\s+to|turn\s+(?:it|this)\s+into)\s+(?:a\s+)?(starter|pro|premium|casual|photo[\s-]?rich|animated)\b/i;

export function classifyUpgradeIntent(instruction: string): UpgradeTarget | null {
    const text = instruction.trim();
    if (!text) return null;

    if (PREMIUM_ONLY.test(text)) return 'premium';

    const explicit = EXPLICIT_TIER.exec(text);
    if (explicit?.[1]) {
        const tier = explicit[1].toLowerCase();
        if (tier === 'premium' || tier === 'animated') return 'premium';
        if (tier === 'pro' || tier === 'photo-rich' || tier === 'photorich') return 'pro';
        return null;
    }

    if (PRO_OR_HIGHER.test(text)) {
        if (/\b(premium|liquid|kinetic|bloom|continuous\s+scroll)\b/i.test(text)) {
            return 'premium';
        }
        return 'pro';
    }

    return null;
}

export function styleTierRank(tier: StyleTier): number {
    if (tier === 'premium') return 2;
    if (tier === 'pro') return 1;
    return 0;
}

export function detectStyleTierFromHtml(html: string | null | undefined): StyleTier | null {
    if (!html) return null;
    const style = html.match(/\bdata-style="(casual|photos|motion)"/i)?.[1]?.toLowerCase();
    if (style === 'motion') return 'premium';
    if (style === 'photos') return 'pro';
    if (style === 'casual') return 'free';

    const chrome = html.match(/\bdata-chrome="(sidebar|topbar|liquid)"/i)?.[1]?.toLowerCase();
    if (chrome === 'liquid') return 'premium';
    if (chrome === 'topbar') return 'pro';
    if (chrome === 'sidebar') return 'free';

    if (/class="[^"]*site-sidebar/i.test(html) || /class='[^']*site-sidebar/i.test(html)) {
        return 'free';
    }
    if (/site-liquid|liquid-deck/i.test(html)) return 'premium';
    if (/site-topbar-blend|site-topbar/i.test(html)) return 'pro';

    return null;
}

export function detectStyleTierFromComposition(composition: Composition | null | undefined): StyleTier | null {
    if (!composition) return null;
    const motion = composition.artDirection.motionId;
    const theme = composition.artDirection.themeId;
    if (motion === 'kinetic' || theme === 'vivid-energy' || theme === 'deep-luxury') return 'premium';
    if (motion === 'editorial' || theme === 'warm-editorial') return 'pro';
    if (motion === 'none' || theme === 'sunlit-craft') return 'free';
    return null;
}

/** Resolve the site's current look tier from HTML first, then composition. */
export function currentStyleTier(opts: {
    html?: string | null;
    composition?: Composition | null;
}): StyleTier {
    return (
        detectStyleTierFromHtml(opts.html) ??
        detectStyleTierFromComposition(opts.composition) ??
        'free'
    );
}

export function upgradeBlockedMessage(needed: UpgradeTarget, current: StyleTier): string {
    const needLabel = needed === 'premium' ? 'Premium' : 'Pro';
    if (current === 'free') {
        return `That look is part of ${needLabel}. Your site is on Starter — keep editing copy and layout here, or upgrade to ${needLabel} to unlock every ${needLabel} look.`;
    }
    if (current === 'pro' && needed === 'premium') {
        return `That liquid / continuous-scroll look is Premium only. Your site is on Pro — keep editing within Pro, or buy the Premium look.`;
    }
    return `That change needs the ${needLabel} look. Stay on your current look, or unlock ${needLabel} first.`;
}

/**
 * Returns a user-facing rejection string when the instruction asks for a higher tier
 * than the site currently has; otherwise null (allowed).
 */
export function styleUpgradeFirewall(opts: {
    instruction: string;
    html?: string | null;
    composition?: Composition | null;
}): string | null {
    const needed = classifyUpgradeIntent(opts.instruction);
    if (!needed) return null;
    const current = currentStyleTier(opts);
    if (styleTierRank(needed) <= styleTierRank(current)) return null;
    return upgradeBlockedMessage(needed, current);
}
