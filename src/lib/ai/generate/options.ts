import type { Composition, FileMap } from '@/lib/contracts';
import { asksTableOrdering } from '@/lib/ai/composition/requested-pages';
import { wireTableOrderSite } from '@/lib/sites/table-order-ui';
import { compositionToFiles } from './to-files';
import { stampPhotoUrls } from './photos';
import {
    STYLE_IDS, STYLE_SPECS, applyStyle,
    type StyleId, type StyleSpec, type StyleTier,
} from './styles';
import { artSeed, variedSpec } from './art-variety';

export interface StyleOption {
    id: StyleId;
    label: string;
    blurb: string;
    tier: StyleTier;
    priceInr: number;
    composition: Composition;
    files: FileMap;
}

export type PhotoLookup = (query: string) => Promise<string>;

function withRequestedExtras(files: FileMap, composition: Composition, prompt?: string): FileMap {
    const text = prompt?.trim() || composition.meta.description || '';
    if (!asksTableOrdering(text)) return files;
    return wireTableOrderSite(files, {
        businessName: composition.meta.title || 'This shop',
    });
}

async function renderOption(
    base: Composition,
    spec: StyleSpec,
    lookup?: PhotoLookup,
    prompt?: string,
    seed = '',
    photoSalt = '',
): Promise<StyleOption> {
    let composition = applyStyle(base, variedSpec(spec, seed));
    if (spec.photos === 'hero') {
        composition = await stampPhotoUrls(composition, lookup, ['hero'], photoSalt);
    } else if (spec.photos) {
        composition = await stampPhotoUrls(composition, lookup, undefined, photoSalt);
    }
    return {
        id: spec.id,
        label: spec.label,
        blurb: spec.blurb,
        tier: spec.tier,
        priceInr: spec.priceInr,
        composition,
        files: withRequestedExtras(
            compositionToFiles(composition, spec.id, seed),
            composition,
            prompt,
        ),
    };
}

/**
 * Three finished sites from one generated composition.
 *
 * `jobId` seeds the art direction, so the same business asking twice gets the same site back
 * while a different business -- or the same one pressing "generate another look" -- gets a
 * different one. Without a seed every site in the product shared one theme.
 */
export async function buildStyleOptions(
    composition: Composition,
    lookup?: PhotoLookup,
    prompt?: string,
    jobId?: string,
): Promise<StyleOption[]> {
    const seed = artSeed({
        title: composition.meta.title,
        vertical: composition.vertical,
        jobId,
    });
    const photoSalt = jobId ?? '';

    return Promise.all(
        STYLE_IDS.map((id) =>
            renderOption(composition, STYLE_SPECS[id], lookup, prompt, seed, photoSalt),
        ),
    );
}

const LOOK_CSS: Record<StyleId, string> = {
    casual: `/* pagecrafts look: casual */\n:root{color-scheme:light}body{font-family:Georgia,"Times New Roman",serif}`,
    photos: `/* pagecrafts look: photos */\n:root{color-scheme:light}body{font-family:system-ui,sans-serif}img{max-width:100%;height:auto;border-radius:1rem}`,
    motion: `/* pagecrafts look: motion */\n@keyframes pc-fade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}body{font-family:system-ui,sans-serif}main,section,article{animation:pc-fade .7s ease both}`,
};

function withLookCss(files: FileMap, styleId: StyleId): FileMap {
    const next = { ...files };
    const overlay = LOOK_CSS[styleId];
    if (next['styles.css']) {
        next['styles.css'] = `${overlay}\n${next['styles.css']}`;
    } else {
        next['styles.css'] = overlay;
        for (const [path, html] of Object.entries(next)) {
            if (!path.endsWith('.html') || /styles\.css/.test(html)) continue;
            next[path] = /<\/head>/i.test(html)
                ? html.replace(/<\/head>/i, `<link rel="stylesheet" href="styles.css"/></head>`)
                : html;
        }
    }
    return next;
}

/** Three looks over a freeform custom FileMap (no section re-render). */
export function buildCustomStyleOptions(
    composition: Composition,
    files: FileMap,
): StyleOption[] {
    return STYLE_IDS.map((id) => {
        const spec = STYLE_SPECS[id];
        return {
            id,
            label: spec.label,
            blurb: spec.blurb,
            tier: spec.tier,
            priceInr: spec.priceInr,
            composition: applyStyle(composition, spec),
            files: withLookCss(files, id),
        };
    });
}
