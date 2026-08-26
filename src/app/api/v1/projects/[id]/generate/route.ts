import 'server-only';

import { z } from 'zod';
import { waitUntil } from '@vercel/functions';
import { withRoute } from '@/lib/kernel/with-route';
import { ok, ApiError } from '@/lib/errors/respond';
import { MAX_CLASSIFY_CHARS } from '@/lib/contracts';
import { jobStore, nextJobId } from '@/lib/ai/jobs/store';
import { runJob } from '@/lib/ai/jobs/runner';
import { checkGenerationBudget } from '@/lib/ai/jobs/budget';
import { persistLedger } from '@/lib/ai/cost/persist';
import { guardAiRequest } from '@/lib/limits/ai-guard';
import { TEMPLATES } from '@/lib/templates';
import { persistGeneratedSite } from '@/lib/ai/generate/persist';
import { recordGenerationUse } from '@/lib/ai/jobs/counters';
import {
    assertFreeGenerationAllowed,
    assertHeavyBuildAllowed,
    recordGenerationUseForBuild,
} from '@/lib/ai/jobs/quota';
import { customBuildFits, estimateSiteBuild, isHeavyBuild } from '@/lib/ai/generate/complexity';
import { aiConfig } from '@/lib/ai/config';
import { supabaseAdminOrNull } from '@/lib/data/supabase-admin';
import { getProject } from '@/lib/data/projects';
import { getProjectFiles } from '@/lib/data/project-files';
import { asContentSchema } from '@/lib/content/schema';
import { crossVerticalFirewall } from '@/lib/editor/cross-vertical-firewall';
import { parseComposition } from '@/lib/editor/parse-composition';
import { resolveSiteVertical } from '@/lib/editor/resolve-site-vertical';
import { setProfileStore } from '@/lib/ai/profile-cache';
import { SupabaseProfileStore } from '@/lib/ai/profile/persist';
import { assessPromptClarity } from '@/lib/ai/assess-clarity';
import { track } from '@/lib/observability/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A build is classify, expand, plan and one call per section, with rate-limit waits
// between them on the free tier. The default ceiling cuts that off part-way and the job
// never reaches done. Publishing already asks for 120 for the same reason.
export const maxDuration = 300;

type Params = { id: string };

const schema = z.object({
    prompt: z.string().min(1).max(MAX_CLASSIFY_CHARS),
    persist: z.boolean().optional(),
});

// POST /api/v1/projects/{id}/generate — 202 with a job id; the work runs after.
export const POST = withRoute<z.infer<typeof schema>, Params>({
    auth: 'required',
    schema,
    handler: async ({ body, params, userId, req, supabase }) => {
        // Owner-scoped read first, before anything else touches params.id.
        //
        // Every other write route on a project reads it through RLS and gets not_found for
        // somebody else's — publish does it via projectPublishInputs. This one did not: the
        // id went straight into the budget check, the quota, the job and the persist step,
        // and a signed-in stranger got 202 for a project they cannot see. RLS still refused
        // the final write, so nothing was overwritten, but the job ran, the caller's budget
        // and free-generation quota were spent on it, and the answer said it had worked.
        //
        // getProject throws not_found when RLS hides the row, which is the same answer the
        // rest of the API gives and the one e2e/cross-user.spec.ts asks for. Found by the
        // D14 cross-user audit, which left the test red on purpose until this landed.
        const project = await getProject(supabase, params.id);
        const { files } = await getProjectFiles(supabase, params.id);
        const composition = parseComposition(files['composition.json']);
        const contentSchema = asContentSchema(project.contentSchema);
        const entry =
            files['index.html'] ??
            Object.keys(files).find((name) => /\.html?$/i.test(name)) ??
            null;
        const contextText = [
            composition?.meta.title,
            project.siteMeta?.title,
            project.name,
            entry ? files[entry]?.slice(0, 4000) : null,
        ]
            .filter(Boolean)
            .join(' ');
        const crossBlocked = crossVerticalFirewall({
            instruction: body.prompt,
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

        const budget = await checkGenerationBudget(userId, params.id, body.prompt);
        if (!budget.ok) throw new ApiError(budget.code, budget.message);

        const quota = await assertFreeGenerationAllowed(params.id, userId, supabase);
        // Charge for a custom build only when one can actually run. The runner checks the
        // same budget before taking the compose path (customBuildFits in runJob) and drops
        // to the section recipe when one call cannot hold a whole site — so on a provider
        // tier that cannot afford compose, gating this as heavy would ask somebody to
        // upgrade for a build they were never going to get.
        const estimate = estimateSiteBuild(body.prompt);
        const cfg = aiConfig();
        const heavy = isHeavyBuild(estimate) && customBuildFits(estimate, {
            composeMaxTokens: cfg.maxOutputTokens.compose,
            tpm: cfg.quota.tpm,
        });
        if (heavy) {
            await assertHeavyBuildAllowed(quota);
        }

        // Clarity judges a brief for a site that does not exist yet: does this name a
        // business, a place, and what they do. On a site that already exists the prompt is
        // an instruction — "make the hero more graphical" — which names none of those and
        // was refused every time, with a message about details the person already gave.
        //
        // The same signal the firewall above uses decides it: a project with sections or a
        // content page is being edited, not described.
        //
        // It runs after the caps and before anything is spent. Ahead of them it answered
        // "we cannot read your brief" to somebody whose real problem was a daily cap, and
        // it costs a model call to say so — one nobody over their limit should pay for.
        const hasExistingSite =
            (composition?.sections.length ?? 0) > 0 || contentSchema.sections.length > 0;

        if (!hasExistingSite) {
            const clarity = await assessPromptClarity(body.prompt);
            if (!clarity.usable) {
                throw new ApiError('brief_unclear', clarity.message);
            }
        }

        const admin = supabaseAdminOrNull();
        if (admin) setProfileStore(new SupabaseProfileStore(admin));
        await recordGenerationUse(userId, params.id);
        track('EV-04', userId, { category: 'unknown', latency_bucket: 'queued' });

        // This route returns before generation finishes, so withRoute's ordinary
        // request-scoped AI guard would release its concurrency slot too early.
        // Acquire it here and hand its lifecycle to the detached runner instead.
        const guard = await guardAiRequest(userId, req.headers);
        if (!guard.ok) return guard.response;

        let handedToRunner = false;
        try {
            const job = await jobStore().create({
                id: nextJobId(),
                projectId: params.id,
                userId,
                prompt: body.prompt,
                status: 'queued',
                sectionsDone: 0,
                sectionsTotal: 0,
                startedAt: Date.now(),
                events: [],
                ledger: [],
            });
            await recordGenerationUseForBuild(params.id, userId, quota, heavy);

            const work = runJob(job, {
                templates: TEMPLATES,
                recordUsage: guard.recordUsage,
                persistLedger: (rows) => persistLedger(supabase, {
                    jobId: job.id,
                    userId,
                    projectId: params.id,
                    prompt: body.prompt,
                }, rows),
                persistSite: (settled) => persistGeneratedSite(supabase, params.id, settled, TEMPLATES),
                release: guard.release,
                onSettled: (settled) => {
                    const elapsed = (settled.endedAt ?? Date.now()) - settled.startedAt;
                    track('EV-05', userId, {
                        category: settled.composition?.vertical ? 'classified' : 'fallback',
                        latency_bucket: latencyBucket(elapsed),
                    });
                },
            }).catch((err) => console.error('[generate]', err));

            // The response goes back at 202 and the build carries on behind it. On Vercel a
            // function instance may be frozen the moment it answers, so a promise nobody
            // registered is killed part-finished — the job row stays at "reading the brief"
            // and the browser polls it forever. waitUntil is how the platform is told to
            // keep the instance alive until this settles.
            //
            // Off Vercel there is no request context to register with; the promise is
            // already running and a long-lived server will finish it either way.
            try {
                waitUntil(work);
            } catch {
                void work;
            }

            handedToRunner = true;

            return ok({ job_id: job.id }, 202);
        } finally {
            if (!handedToRunner) await guard.release();
        }
    },
});

function latencyBucket(ms: number): string {
    if (ms < 15_000) return '0-15s';
    if (ms < 30_000) return '15-30s';
    if (ms < 45_000) return '30-45s';
    return '45s+';
}
