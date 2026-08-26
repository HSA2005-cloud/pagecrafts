import 'server-only';

import { z } from 'zod';
import { withRoute } from '@/lib/kernel/with-route';
import { ok, ApiError } from '@/lib/errors/respond';
import { proposeEdit } from '@/lib/ai/edit/propose';
import { recordEditOp } from '@/lib/ai/cost/edit-ops';
import { storeFor, nextEditId } from '@/lib/ai/edit/store';
import { createCommit } from '@/lib/data/commits';
import { rowFor } from '@/lib/ai/cost/ledger';
import { persistLedger } from '@/lib/ai/cost/persist';
import { nextJobId } from '@/lib/ai/jobs/store';
import { SECTION_KEYS, type SectionInstance } from '@/lib/contracts';
import { getProjectFiles } from '@/lib/data/project-files';
import { getProject } from '@/lib/data/projects';
import { asContentSchema } from '@/lib/content/schema';
import { MAX_INSTRUCTION_CHARS } from '@/lib/contracts';
import { styleUpgradeFirewall } from '@/lib/editor/style-firewall';
import { crossVerticalFirewall } from '@/lib/editor/cross-vertical-firewall';
import { resolveSiteVertical } from '@/lib/editor/resolve-site-vertical';
import { parseComposition } from '@/lib/editor/parse-composition';

function pickHtmlEntry(paths: string[]): string | null {
    const html = paths.filter((p) => /\.html?$/i.test(p));
    const preferred = ['index.html', 'home.html', 'page.html'];
    for (const name of preferred) {
        if (html.includes(name)) return name;
    }
    return html[0] ?? null;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

const schema = z.object({
    instruction: z.string().min(1).max(MAX_INSTRUCTION_CHARS),
    section: z.object({
        id: z.string().min(1),
        type: z.enum(SECTION_KEYS),
        variant: z.string().min(1),
        brief: z.string().max(300).default(''),
        props: z.record(z.string(), z.unknown()).default({}),
    }),
});

// POST /api/v1/projects/{id}/edits — proposes a diff. C-03: this route has no
// write path at all, not a disabled one. Applying is a separate endpoint.
export const POST = withRoute<z.infer<typeof schema>, Params>({
    auth: 'required',
    limit: 'ai',
    schema,
    handler: async ({ body, params, userId, supabase, recordUsage }) => {
        if (typeof supabase.from === 'function') {
            try {
                const [project, { files }] = await Promise.all([
                    getProject(supabase, params.id),
                    getProjectFiles(supabase, params.id),
                ]);
                const entry = pickHtmlEntry(Object.keys(files));
                const html = entry ? files[entry] ?? null : null;
                const composition = parseComposition(files['composition.json']);
                const contentSchema = asContentSchema(project.contentSchema);
                const contextText = [
                    composition?.meta.title,
                    project.siteMeta?.title,
                    project.name,
                    html?.slice(0, 4000),
                ]
                    .filter(Boolean)
                    .join(' ');
                const blocked = styleUpgradeFirewall({
                    instruction: body.instruction,
                    html,
                    composition,
                });
                if (blocked) {
                    throw new ApiError('validation_failed', blocked);
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
            } catch (err) {
                if (err instanceof ApiError) throw err;
            }
        }

        let preCommitSha: string | null = null;
        if (typeof supabase.from === 'function') {
            try {
                const { sha } = await createCommit(supabase, params.id, 'Before AI edit', 'system');
                preCommitSha = sha;
            } catch (err) {
                if (!(err instanceof ApiError && err.code === 'not_found')) throw err;
            }
        }

        const section: SectionInstance = {
            ...body.section,
            visible: true,
            locked: false,
            source: 'ai',
        } as SectionInstance;

        const { data, usage } = await proposeEdit(section, body.instruction);
        recordEditOp('provider', 'propose');
        await Promise.all([
            recordUsage(usage),
            persistLedger(supabase, {
                jobId: nextJobId(),
                userId,
                projectId: params.id,
                prompt: body.instruction,
            }, [rowFor('edit', usage, 'completed')]),
        ]);
        const stored = await storeFor(supabase).put({
            ...data,
            id: nextEditId(),
            projectId: params.id,
            userId,
            preProps: { ...section.props },
            consumed: false,
            preCommitSha,
        });

        return ok({
            ...data,
            edit_id: stored.id,
            pre_commit_sha: preCommitSha,
            target_section_id: stored.targetSectionId,
        });
    },
});
