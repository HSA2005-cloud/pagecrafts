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

/**
 * Finds a photograph for a search phrase.
 *
 * `sectionType` is a hint, not a requirement: a lookup that draws its own pictures uses it
 * to frame them for the slot — wide for a hero, squarer for a card — and every stock lookup
 * ignores it entirely.
 */
export type PhotoLookup = (query: string, sectionType?: string) => Promise<string>;

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
    excludePhotos: ReadonlySet<string> = new Set(),
): Promise<StyleOption> {
    let composition = applyStyle(base, variedSpec(spec, seed));
    if (spec.photos === 'hero') {
        composition = await stampPhotoUrls(
            composition, lookup, ['hero'], photoSalt, excludePhotos,
        );
    } else if (spec.photos) {
        composition = await stampPhotoUrls(
            composition, lookup, undefined, photoSalt, excludePhotos,
        );
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
 *
 * `excludePhotos` are Unsplash ids already used as heroes on earlier Sets for this project.
 */
export async function buildStyleOptions(
    composition: Composition,
    lookup?: PhotoLookup,
    prompt?: string,
    jobId?: string,
    excludePhotos: ReadonlySet<string> = new Set(),
): Promise<StyleOption[]> {
    const seed = artSeed({
        title: composition.meta.title,
        vertical: composition.vertical,
        jobId,
    });
    const photoSalt = jobId ?? '';

    return Promise.all(
        STYLE_IDS.map((id) =>
            renderOption(
                composition,
                STYLE_SPECS[id],
                lookup,
                prompt,
                seed,
                photoSalt,
                excludePhotos,
            ),
        ),
    );
}

const LOOK_CSS: Record<StyleId, string> = {
    casual: `/* pagecrafts look: casual */
:root{color-scheme:light}
body{font-family:"Avenir Next",Avenir,"Segoe UI",system-ui,sans-serif;margin:0;background:#fff;color:#1a1a1a}
img{max-width:100%;height:auto;border-radius:0.75rem;filter:none!important}`,
    // Custom builds used to get a one-line overlay — Pro looked like Casual with a
    // rounded thumbnail. This is a real cinematic cover so Pick a look matches recipe Pro.
    photos: `/* pagecrafts look: photos */
:root{color-scheme:light}
body[data-style="photos"],body.look-photos,html:has(body){
  --display-font:Newsreader,"Iowan Old Style",Palatino,Georgia,serif;
}
body{margin:0;font-family:system-ui,sans-serif;color:#111}
img{filter:none!important;border-radius:0!important}
/* First photograph becomes a full-viewport cinematic hero */
body > img:first-of-type,
main > img:first-of-type,
.hero img:first-of-type,
[class*="hero"] img:first-of-type,
header img:first-of-type,
main > section:first-child img:first-of-type,
main > div:first-child img:first-of-type{
  display:block!important;
  width:100vw!important;
  max-width:none!important;
  height:100vh!important;
  height:100svh!important;
  object-fit:cover!important;
  object-position:center!important;
  margin:0!important;
  border-radius:0!important;
}
h1{font-family:var(--display-font,Georgia,serif);font-weight:500;letter-spacing:-0.028em}`,
    motion: `/* pagecrafts look: motion */
:root{color-scheme:dark}
@keyframes pc-fade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
body{margin:0;font-family:Bodoni Moda,Didot,Georgia,serif;background:#08070a;color:#f7f4ef}
img{filter:none!important;border-radius:0!important}
body > img:first-of-type,
main > img:first-of-type,
.hero img:first-of-type,
[class*="hero"] img:first-of-type,
header img:first-of-type,
main > section:first-child img:first-of-type{
  display:block!important;width:100vw!important;max-width:none!important;
  height:100vh!important;height:100svh!important;object-fit:cover!important;margin:0!important;border-radius:0!important
}
main,section,article{animation:pc-fade .7s ease both}`,
};

function tagBodyStyle(html: string, styleId: StyleId): string {
    if (/<body\b[^>]*data-style=/i.test(html)) {
        return html.replace(/data-style="[^"]*"/i, `data-style="${styleId}"`);
    }
    if (/<body\b/i.test(html)) {
        return html.replace(/<body\b/i, `<body data-style="${styleId}" class="look-${styleId} site"`);
    }
    return html;
}

function withLookCss(files: FileMap, styleId: StyleId): FileMap {
    const next = { ...files };
    const overlay = LOOK_CSS[styleId];
    if (next['index.html']) {
        next['index.html'] = tagBodyStyle(next['index.html'], styleId);
    }
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

/**
 * Three looks over a freeform custom FileMap.
 *
 * Prefer regenerating real Casual / Photo-rich / Animated sites from the composition
 * whenever we can stamp photographs — the old LOOK_CSS overlay never made Pro cinematic.
 * Falls back to restyled custom files when no photo lookup is available.
 */
export async function buildCustomStyleOptions(
    composition: Composition,
    files: FileMap,
    lookup?: PhotoLookup,
    prompt?: string,
    jobId?: string,
    excludePhotos: ReadonlySet<string> = new Set(),
): Promise<StyleOption[]> {
    if (lookup) {
        return buildStyleOptions(composition, lookup, prompt, jobId, excludePhotos);
    }

    return STYLE_IDS.map((id) => {
        const spec = STYLE_SPECS[id];
        return {
            id,
            label: spec.label,
            blurb: spec.blurb,
            tier: spec.tier,
            priceInr: spec.priceInr,
            composition: applyStyle(composition, variedSpec(spec, artSeed({
                title: composition.meta.title,
                vertical: composition.vertical,
                jobId,
            }))),
            files: withLookCss(files, id),
        };
    });
}
