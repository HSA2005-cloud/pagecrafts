import 'server-only';

import { z } from 'zod';
import { withRoute } from '@/lib/kernel/with-route';
import { ok, ApiError } from '@/lib/errors/respond';
import { getProject } from '@/lib/data/projects';
import { getProjectFiles } from '@/lib/data/project-files';
import { assertCanEdit } from '@/lib/data/entitlements';
import { asContentSchema } from '@/lib/content/schema';
import { applyContentToHtml } from '@/lib/content/slots';
import { rewriteTemplateCopy } from '@/lib/ai/edit/rewrite-copy';
import { crossVerticalFirewall } from '@/lib/editor/cross-vertical-firewall';
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
});

function entryHtml(files: Record<string, string>): string | null {
    if (files['index.html']) return 'index.html';
    return Object.keys(files).find((name) => /\.html?$/i.test(name)) ?? null;
}

// POST /api/v1/projects/{id}/copy-edits — rewrite words on a forked design.
// Layout stays. The editor shows the suggestion; keeping it is a separate write.
export const POST = withRoute<z.infer<typeof schema>, Params>({
    auth: 'required',
    limit: 'ai',
    schema,
    handler: async ({ body, params, userId, supabase, recordUsage }) => {
        await assertCanEdit(supabase, userId, params.id);
        const project = await getProject(supabase, params.id);
        const schemaForPage = asContentSchema(project.contentSchema);
        if (!schemaForPage.sections.length) {
            throw new ApiError('validation_failed', 'This site has nothing to rewrite yet.');
        }

        const tree = await getProjectFiles(supabase, params.id);
        const path = entryHtml(tree.files);
        if (!path) {
            throw new ApiError('validation_failed', 'This site has no page to rewrite.');
        }

        const composition = parseComposition(tree.files['composition.json']);
        const contextText = [
            composition?.meta.title,
            project.siteMeta?.title,
            project.name,
            tree.files[path]?.slice(0, 4000),
        ]
            .filter(Boolean)
            .join(' ');
        const crossBlocked = crossVerticalFirewall({
            instruction: body.instruction,
            vertical: resolveSiteVertical({
                composition,
                sourceTemplateId: project.sourceTemplateId,
                contextText,
            }),
            sectionCount: composition?.sections.length ?? 0,
            hasContentPage: schemaForPage.sections.length > 0,
            contextText,
        });
        if (crossBlocked) {
            throw new ApiError('validation_failed', crossBlocked);
        }

        const before = tree.files[path] ?? '';
        let rewritten;
        try {
            rewritten = await rewriteTemplateCopy(schemaForPage, project.contentJson, body.instruction);
        } catch {
            throw new ApiError('internal', 'The suggestion could not be prepared. Try again.');
        }

        const after = applyContentToHtml(before, schemaForPage, rewritten.content);
        if (after === before) {
            throw new ApiError(
                'validation_failed',
                'Nothing on the page changed. Try a more specific request.',
            );
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

        return ok({
            path,
            before,
            after,
            explanation: rewritten.explanation,
        });
    },
});
