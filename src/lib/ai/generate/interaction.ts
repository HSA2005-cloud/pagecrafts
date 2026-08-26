import { INTERACTION_IDS, type InteractionId } from '@/lib/render/interaction-assets';
import type { StyleId } from './styles';

/**
 * Which interactions this business gets — the Rs 999 half of "no two the same".
 *
 * A single fixed set would make every Premium site behave identically, which is the fault
 * the Rs 499 work just removed from how they look. So the kit is drawn per business, from a
 * pool weighted by what the trade is for: a restaurant wants warmth and depth, a gym wants
 * things that respond hard and fast, a clinic wants calm.
 *
 * Only the Premium look gets any of it. Free and Pro pages ship with none, which is what
 * makes the tier worth its price rather than a badge.
 */

/** Always drawn from, so every Premium page answers the cursor somehow. */
const CURSOR: readonly InteractionId[] = ['spotlight', 'parallax', 'tilt', 'magnetic'];

/** Ambient motion that carries a page without needing a pointer — including on a phone. */
const AMBIENT: readonly InteractionId[] = ['depth', 'float'];

/**
 * A nudge, not a rule. Every trade can still draw anything; these just come up more often,
 * so a jeweller leans to light and a gym leans to snap.
 */
const LEANS: Array<[RegExp, readonly InteractionId[]]> = [
    [/restaurant|cafe|bakery|food|dining|kitchen|sweet|mithai/i, ['spotlight', 'float']],
    [/gym|fitness|yoga|sport|training/i, ['magnetic', 'tilt']],
    [/jewel|boutique|fashion|salon|beauty/i, ['spotlight', 'parallax']],
    [/clinic|dental|hospital|doctor|care/i, ['depth', 'float']],
    [/studio|photo|architect|design|agency|portfolio/i, ['parallax', 'tilt']],
    [/tech|software|saas|app|digital/i, ['tilt', 'depth']],
];

function hash(seed: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}

function pick<T>(pool: readonly T[], seed: string, facet: string): T {
    return pool[hash(`${seed}:${facet}`) % pool.length]!;
}

/**
 * Three effects: one the trade leans toward, one more cursor-reactive, one ambient. Three is
 * the ceiling on purpose — a page doing six things at once reads as a demo, not a business.
 */
export function interactionKit(
    styleId: StyleId,
    seed: string,
    vertical = '',
): InteractionId[] {
    if (styleId !== 'motion' || !seed) return [];

    const lean = LEANS.find(([pattern]) => pattern.test(vertical))?.[1] ?? CURSOR;
    const kit: InteractionId[] = [pick(lean, seed, 'lean')];

    const cursor = CURSOR.filter((id) => !kit.includes(id));
    if (cursor.length > 0) kit.push(pick(cursor, seed, 'cursor'));

    const ambient = AMBIENT.filter((id) => !kit.includes(id));
    if (ambient.length > 0) kit.push(pick(ambient, seed, 'ambient'));

    return kit;
}

/** Every combination the Premium tier can produce, for the claim on the pricing page. */
export function interactionCombinations(): number {
    const seen = new Set<string>();

    for (const lean of INTERACTION_IDS) {
        for (const cursor of CURSOR) {
            for (const ambient of AMBIENT) {
                const kit = [lean];
                if (cursor !== lean) kit.push(cursor);
                if (!kit.includes(ambient)) kit.push(ambient);
                seen.add([...kit].sort().join('+'));
            }
        }
    }

    return seen.size;
}
