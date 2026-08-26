import type { ArtDirection } from '@/lib/contracts';
import { artDirectionCss } from './art-direction';
import { motionCss, motionJs } from './motion-assets';
import { interactionCss, interactionJs, type InteractionId } from './interaction-assets';

export interface ShellOptions {
    title: string;
    description: string;
    lang: string;
    motionId: string;
    themeCss: string;
    body: string;
    /** Premium only. Empty for every other look, which is what the tier is sold on. */
    interaction?: readonly InteractionId[];
    /** Optional Google Fonts (or similar) link tags for look-tier display type. */
    fontLinks?: string;
}

/**
 * D14 — the shell for a generated composition, with every art-direction dial
 * applied. `pageShell` still takes raw CSS for callers that have their own
 * (a forked template brings its own stylesheet); this is the composition path,
 * where the dials are the stylesheet.
 */
export function compositionShell(o: {
    title: string;
    description: string;
    lang: string;
    artDirection: ArtDirection;
    body: string;
    interaction?: readonly InteractionId[];
    fontLinks?: string;
}): string {
    return pageShell({
        title: o.title,
        description: o.description,
        lang: o.lang,
        motionId: o.artDirection.motionId,
        themeCss: artDirectionCss(o.artDirection),
        body: o.body,
        interaction: o.interaction,
        fontLinks: o.fontLinks,
    });
}

/** Display faces for paid looks — system Didot/Iowan are missing on most machines. */
export function lookFontLinks(style?: 'casual' | 'photos' | 'motion'): string {
    if (style === 'motion') {
        return [
            '<link rel="preconnect" href="https://fonts.googleapis.com">',
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
            '<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500;6..96,600&display=swap" rel="stylesheet">',
        ].join('\n');
    }
    if (style === 'photos') {
        return [
            '<link rel="preconnect" href="https://fonts.googleapis.com">',
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
            '<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap" rel="stylesheet">',
        ].join('\n');
    }
    return '';
}

export function pageShell(o: ShellOptions): string {
    const kit = o.interaction ?? [];
    const fx = kit.length > 0 ? ` data-fx="${kit.join(' ')}"` : '';
    const fxCss = interactionCss(kit);
    const fxJs = interactionJs(kit);
    const fonts = o.fontLinks ? `\n${o.fontLinks}` : '';

    return `<!doctype html>
<html lang="${o.lang}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${o.title}</title>
<meta name="description" content="${o.description}">
<script>document.documentElement.classList.remove('no-js')</script>${fonts}
<style>
${o.themeCss}
${motionCss}${fxCss ? `\n${fxCss}` : ''}
</style>
</head>
<body data-motion="${o.motionId}"${fx}>
${o.body}
<script>
${motionJs}
</script>${fxJs ? `\n<script>\n${fxJs}\n</script>` : ''}
</body>
</html>`;
}