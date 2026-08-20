import type { Composition, FileMap } from '@/lib/contracts';
import { compositionToFiles } from './to-files';
import { stampPhotoUrls } from './photos';
import {
    STYLE_IDS, STYLE_SPECS, applyStyle,
    type StyleId, type StyleSpec, type StyleTier,
} from './styles';

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

async function renderOption(
    base: Composition,
    spec: StyleSpec,
    lookup?: PhotoLookup,
): Promise<StyleOption> {
    let composition = applyStyle(base, spec);
    if (spec.photos === 'hero') {
        composition = await stampPhotoUrls(composition, lookup, ['hero']);
    } else if (spec.photos) {
        composition = await stampPhotoUrls(composition, lookup);
    }
    return {
        id: spec.id,
        label: spec.label,
        blurb: spec.blurb,
        tier: spec.tier,
        priceInr: spec.priceInr,
        composition,
        files: compositionToFiles(composition, spec.id),
    };
}

/** Three finished sites from one generated composition. */
export async function buildStyleOptions(
    composition: Composition,
    lookup?: PhotoLookup,
): Promise<StyleOption[]> {
    return Promise.all(STYLE_IDS.map((id) => renderOption(composition, STYLE_SPECS[id], lookup)));
}
