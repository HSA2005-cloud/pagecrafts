import 'server-only';

import { z } from 'zod';
import { withRoute } from '@/lib/kernel/with-route';
import { ok, ApiError } from '@/lib/errors/respond';
import { getProject } from '@/lib/data/projects';
import { getProjectFiles } from '@/lib/data/project-files';
import { assertCanEdit } from '@/lib/data/entitlements';
import { asContentSchema } from '@/lib/content/schema';
import { rewriteSiteFiles } from '@/lib/ai/edit/rewrite-page';
import { styleUpgradeFirewall } from '@/lib/editor/style-firewall';
import { crossVerticalFirewall } from '@/lib/editor/cross-vertical-firewall';
import { offTopicWebsiteAsk } from '@/lib/editor/website-ask-gate';
import { resolveSiteVertical } from '@/lib/editor/resolve-site-vertical';
import { parseComposition } from '@/lib/editor/parse-composition';
import { persistLedger } from '@/lib/ai/cost/persist';
import { rowFor } from '@/lib/ai/cost/ledger';
import { nextJobId } from '@/lib/ai/jobs/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

const schema = z.object({
    instruction: z.string().min(1).max(300),
    focusPath: z.string().max(200).optional(),
});

function entryHtml(files: Record<string, string>): string | null {
    if (files['index.html']) return 'index.html';
    return Object.keys(files).find((name) => /\.html?$/i.test(name)) ?? null;
}

// POST /api/v1/projects/{id}/page-edits — code-aware multi-page HTML suggestion.
export const POST = withRoute<z.infer<typeof schema>, Params>({
    auth: 'required',
    limit: 'ai',
    schema,
    handler: async ({ body, params, userId, supabase, recordUsage }) => {
        await assertCanEdit(supabase, userId, params.id);

        const offTopic = offTopicWebsiteAsk(body.instruction);
        if (offTopic) {
            throw new ApiError('validation_failed', offTopic);
        }

        const project = await getProject(supabase, params.id);
        const tree = await getProjectFiles(supabase, params.id);
        const focus =
            (body.focusPath && tree.files[body.focusPath] ? body.focusPath : null) ??
            entryHtml(tree.files);
        if (!focus) {
            throw new ApiError(
                'validation_failed',
                'This site has no HTML page to edit yet. Generate or open a page first.',
            );
        }

        const htmlFiles: Record<string, string> = {};
        for (const [path, content] of Object.entries(tree.files)) {
            if (/\.html?$/i.test(path) && typeof content === 'string') {
                htmlFiles[path] = content;
            }
        }
        if (!htmlFiles[focus]?.trim()) {
            throw new ApiError('validation_failed', 'The page file is empty.');
        }

        const composition = parseComposition(tree.files['composition.json']);
        const contentSchema = asContentSchema(project.contentSchema);
        const contextText = [
            composition?.meta.title,
            project.siteMeta?.title,
            project.name,
            htmlFiles[focus]?.slice(0, 4000),
        ]
            .filter(Boolean)
            .join(' ');

        const styleBlocked = styleUpgradeFirewall({
            instruction: body.instruction,
            html: htmlFiles[focus],
            composition,
        });
        if (styleBlocked) {
            throw new ApiError('validation_failed', styleBlocked);
        }

        const crossBlocked = crossVerticalFirewall({
            instruction: body.instruction,
            vertical: resolveSiteVertical({
                composition,
                sourceTemplateId: project.sourceTemplateId,
                contextText,
            }),
            sectionCount: composition?.sections.length ?? 0,
            hasContentPage: contentSchema.sections.length > 0,
            contextText,
        });
        if (crossBlocked) {
            throw new ApiError('validation_failed', crossBlocked);
        }

        let rewritten;
        try {
            rewritten = await rewriteSiteFiles(htmlFiles, body.instruction, focus);
        } catch (error) {
            const detail =
                error instanceof Error && error.message.trim()
                    ? error.message.trim()
                    : 'The page suggestion could not be prepared. Try again.';
            throw new ApiError('validation_failed', detail);
        }

        const changed: Record<string, string> = {};
        for (const [path, after] of Object.entries(rewritten.files)) {
            if (after !== htmlFiles[path]) changed[path] = after;
        }

        await Promise.all([
            recordUsage(rewritten.usage),
            persistLedger(
                supabase,
                {
                    jobId: nextJobId(),
                    userId,
                    projectId: params.id,
                    prompt: body.instruction,
                },
                [rowFor('edit', rewritten.usage, 'completed')],
            ),
        ]);

        const primary = rewritten.primaryPath;
        return ok({
            path: primary,
            before: htmlFiles[primary] ?? '',
            after: rewritten.files[primary] ?? '',
            explanation: rewritten.explanation,
            files: changed,
        });
    },
});
