import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileMap, PublishFile, SiteMeta } from "@/lib/contracts";
import { getProject } from "@/lib/data/projects";
import { getProjectFiles } from "@/lib/data/project-files";
import { applyContentToFiles } from "@/lib/content/to-files";
import { applyAssetsToHtml, bundleAssets, referencedAssetIds } from "./publish-assets";
import { wireOrderPayments } from "@/lib/sites/pay-page";

// The file set that actually goes live (R3 D9).
//
// The working tree is what the owner edits; it is not quite what should be published. Two
// things are deliberately left blank in a design and filled in here, at the last moment,
// because neither is knowable when the template is authored:
//
//   the <head> — a template ships its own name as the title, which is right for a preview
//   and wrong for a live site. site_meta is what the owner chose, and it is what search
//   results and shared links read.
//
//   <form action=""> — blueprint.ts leaves it empty on purpose, with a comment saying a
//   template must never ship a third-party destination. The owner's form_endpoint is the
//   destination, and until they have one the form must not pretend to work.
//
// Nothing here mutates the project. The tree that comes back is a copy for the publisher,
// so what the owner sees in the editor stays exactly what they wrote.

const ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
};

function escapeAttr(value: string): string {
    return value.replace(/[&<>"]/g, (char) => ESCAPES[char]);
}

/**
 * The <head> tags a published page needs, from what the owner actually set.
 *
 * A tag is emitted only when there is a value for it. An empty `<meta name="description">`
 * is worse than no description at all: it tells a search engine the page has one and that
 * it is blank.
 *
 * Asset ids are resolved to URLs by the caller, which is the only place that can sign a
 * storage URL. An unresolved id is skipped rather than written raw — a favicon pointing at
 * a uuid is a broken request on every page load.
 */
export function metaTags(siteMeta: SiteMeta, assetUrls: Record<string, string> = {}): string[] {
    const tags: string[] = [];
    const title = siteMeta.title?.trim();
    const description = siteMeta.description?.trim();

    if (title) {
        tags.push(`<title>${escapeAttr(title)}</title>`);
        tags.push(`<meta property="og:title" content="${escapeAttr(title)}" />`);
    }

    if (description) {
        tags.push(`<meta name="description" content="${escapeAttr(description)}" />`);
        tags.push(`<meta property="og:description" content="${escapeAttr(description)}" />`);
    }

    const favicon = siteMeta.faviconAssetId ? assetUrls[siteMeta.faviconAssetId] : undefined;
    if (favicon) tags.push(`<link rel="icon" href="${escapeAttr(favicon)}" />`);

    const ogImage = siteMeta.ogImageAssetId ? assetUrls[siteMeta.ogImageAssetId] : undefined;
    if (ogImage) tags.push(`<meta property="og:image" content="${escapeAttr(ogImage)}" />`);

    // Only meaningful alongside an image; on its own it describes nothing.
    if (ogImage || title) tags.push(`<meta property="og:type" content="website" />`);

    return tags;
}

/** Replace the template's own <title> so the owner's does not sit beside it. */
function stripTemplateTitle(html: string): string {
    return html.replace(/[ \t]*<title>[\s\S]*?<\/title>\r?\n?/i, "");
}

function injectHead(html: string, tags: string[]): string {
    if (tags.length === 0) return html;

    const withoutTitle = tags.some((tag) => tag.startsWith("<title>"))
        ? stripTemplateTitle(html)
        : html;

    const block = tags.join("\n  ");

    // Before </head> rather than after <head>, so the charset and viewport tags a browser
    // wants early stay early.
    if (/<\/head>/i.test(withoutTitle)) {
        return withoutTitle.replace(/<\/head>/i, `  ${block}\n  </head>`);
    }

    // No </head> to insert before. A blueprint always writes one, but a sourced design is
    // somebody else's markup and need not: an unclosed head, or no head at all, is
    // malformed HTML that browsers accept happily. A plain replace writes nothing when it
    // matches nothing, so the site used to go live with no title, no description and no
    // share card, and nothing anywhere said so (R3 D15).
    //
    // Each fallback puts the tags where a browser will still read them as head content.
    if (/<head\b[^>]*>/i.test(withoutTitle)) {
        return withoutTitle.replace(/(<head\b[^>]*>)/i, `$1\n  ${block}`);
    }

    if (/<html\b[^>]*>/i.test(withoutTitle)) {
        return withoutTitle.replace(/(<html\b[^>]*>)/i, `$1\n<head>\n  ${block}\n</head>`);
    }

    // A fragment with no document structure at all. Prepending still gives the browser the
    // tags before any body content, which is what they need to take effect.
    return `<head>\n  ${block}\n</head>\n${withoutTitle}`;
}

/**
 * Point every contact form at the owner's endpoint, or disable it.
 *
 * A form with `action=""` posts to the page itself, which on a static host is a reload that
 * silently loses whatever was typed. That is worse than a form that visibly cannot be used:
 * one wastes somebody's message and tells nobody, the other is honest.
 */
function wireForms(html: string, formEndpoint: string | null): string {
    return html.replace(
        /<form\b([^>]*?)\saction="([^"]*)"([^>]*)>/gi,
        (whole, before: string, existing: string, after: string) => {
            // A template that already points somewhere is left alone; that is the author's
            // decision and not ours to overwrite at publish time.
            if (existing.trim() !== "") return whole;

            if (!formEndpoint) {
                return `<form${before} action="" data-form-disabled="true" aria-disabled="true"${after}>`;
            }
            return `<form${before} action="${escapeAttr(formEndpoint)}" method="post"${after}>`;
        },
    );
}

export interface PublishInputs {
    files: FileMap;
    siteMeta: SiteMeta;
    formEndpoint: string | null;
    /** assetId -> a URL the published page can actually fetch. */
    assetUrls?: Record<string, string>;
}

/**
 * The working tree, prepared for going live.
 *
 * HTML pages get the owner's title and form destination. Stylesheets and scripts go
 * across byte for byte — publishing is not the place to rewrite them.
 */
export function publishableFiles({
    files,
    siteMeta,
    formEndpoint,
    assetUrls = {},
}: PublishInputs): FileMap {
    const tags = metaTags(siteMeta, assetUrls);
    let changed = false;
    const next: FileMap = { ...files };

    for (const [path, html] of Object.entries(files)) {
        if (!/\.html?$/i.test(path)) continue;
        const wired = wireForms(injectHead(html, tags), formEndpoint);
        if (wired !== html) {
            next[path] = wired;
            changed = true;
        }
    }

    if (siteMeta.upiId) {
        const paid = wireOrderPayments(next, {
            businessName: siteMeta.title?.trim() || "This shop",
            upiId: siteMeta.upiId,
        });
        return paid;
    }

    return changed ? next : files;
}

/**
 * A project, ready to hand to publish() (R3 D9).
 *
 * This is the whole of the handover to the publish route: read the working tree and the
 * owner's settings, prepare the one file that needs preparing, and return it in the shape
 * publish() takes. The route calling it needs one line and no knowledge of site_meta,
 * form_endpoint or where either lives.
 *
 * Owner-scoped by RLS through the caller's client, so a project that is not theirs is not
 * found rather than published.
 *
 * Images travel with the build (R3 D11). The referenced assets are copied into the
 * deployment under `assets/`, so a favicon is a relative path rather than a signed URL that
 * expires in an hour — which is what made this an open hosting question until now.
 */
export async function projectPublishInputs(
    supabase: SupabaseClient,
    projectId: string,
): Promise<{ projectName: string; files: PublishFile[] }> {
    const [project, tree] = await Promise.all([
        getProject(supabase, projectId),
        getProjectFiles(supabase, projectId),
    ]);

    // Only what the site shows. A project collects images somebody tried and replaced, and
    // shipping those would put pictures the owner thought they had removed onto a live site.
    const bundled = await bundleAssets(
        supabase,
        projectId,
        referencedAssetIds(project.contentJson, project.contentSchema, project.siteMeta),
    );

    // The owner's words, written into the markup here rather than trusted to have been
    // written already.
    //
    // The editor renders content into the working tree as you type, so the stored file is
    // usually right. "Usually" is not good enough for the one step that decides what the
    // world sees: content_json is the record of what the owner meant, and any path that
    // updates it without a browser attached — the content API called directly, a restore, a
    // fork — leaves the stored markup a version behind. Publishing that ships a page with
    // the template's words on it, and the owner has no way to tell until someone reads
    // their live site.
    //
    // Applying it again when it has already been applied is a no-op: the renderer writes
    // values into slots, so writing the same values produces the same bytes.
    const rendered = applyContentToFiles(
        tree.files,
        project.contentJson,
        project.contentSchema,
    );

    // Then the images. The two renderers are halves of one job — to-files.ts deliberately
    // skips image slots, which is what this fills in — so content has to land before assets.
    const html = rendered["index.html"];
    const withAssets = html
        ? {
              ...rendered,
              "index.html": applyAssetsToHtml(
                  html,
                  project.contentJson,
                  project.contentSchema,
                  bundled.paths,
              ),
          }
        : rendered;

    const files = publishableFiles({
        files: withAssets,
        siteMeta: project.siteMeta,
        formEndpoint: project.formEndpoint,
        assetUrls: bundled.paths,
    });

    return {
        projectName: project.name,
        files: [
            ...Object.entries(files).map(([path, content]) => ({
                path,
                content,
                encoding: "utf-8" as const,
            })),
            // Base64 because these are photographs, not text. PublishFile carries the
            // encoding so the push side never has to guess from the extension.
            ...Object.entries(bundled.files).map(([path, content]) => ({
                path,
                content,
                encoding: "base64" as const,
            })),
        ]
            // Sorted so two publishes of an unchanged site produce the same input, which is
            // what lets the idempotency key mean anything.
            .sort((a, b) => a.path.localeCompare(b.path)),
    };
}
