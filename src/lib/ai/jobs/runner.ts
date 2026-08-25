import { classify } from '../classify';
import { cachedProfile as fetchProfile } from '../profile-cache';
import { plan } from '../generate/plan';
import { fillSection } from '../generate/fill';
import { assemble } from '../generate/assemble';
import { compositionToFiles } from '../generate/to-files';
import { buildCustomStyleOptions, buildStyleOptions } from '../generate/options';
import { composeCustomSite } from '../generate/compose-custom';
import { customBuildFits, estimateSiteBuild } from '../generate/complexity';
import { expandBrief } from '../generate/expand-brief';
import { aiConfig } from '../config';
import { bankPhotoUrl } from '../generate/photos';
import { checkAndRecord } from '../composition/validate';
import { withOneRepair } from '../generate/repair';
import { nearestTemplate } from '../generate/fallback';
import { CostLedger, type LedgerRow } from '../cost/ledger';
import type { RankableTemplate, RankAttributes } from '../rank';
import type {
    FileMap, SectionInstance, SectionProps, Tone, Usage, VerticalProfile,
} from '@/lib/contracts';
import { jobStore } from './store';
import type { Job, JobEventName, JobStatus } from './types';

export interface RunnerDeps {
    /** Candidates for the last-resort template fallback. */
    templates?: readonly RankableTemplate[];
    /** Persist ledger rows; must not throw. */
    persistLedger?: (rows: readonly LedgerRow[]) => Promise<void>;
    /** Write the finished site (files, schema, content) to the project. */
    persistSite?: (job: Job) => Promise<void>;
    /** Funnel event after the job settles. */
    onSettled?: (job: Job) => void;
    /** Records the request's aggregate token spend in the shared daily cap. */
    recordUsage?: (usage: Pick<Usage, 'inputTokens' | 'outputTokens'>) => Promise<void>;
    /** Releases resources held for the full lifetime of this detached job. */
    release?: () => Promise<void>;
}

/**
 * Walks a job through queued → planning → streaming → validating → done|failed.
 *
 * `repairing` is entered at most once per section — `withOneRepair` enforces that
 * by construction. `failed` is only reachable once the template fallback has also
 * been exhausted, so a user who lands there still has a site.
 */
export async function runJob(job: Job, deps: RunnerDeps = {}): Promise<Job> {
    const store = jobStore();
    const ledger = new CostLedger();
    let fallbackAttrs: RankAttributes = {};

    const emit = async (name: JobEventName, data?: Record<string, unknown>) => {
        const current = await store.get(job.id);
        const events = [...(current?.events ?? []), { name, at: Date.now(), data }];
        await store.update(job.id, { events });
    };

    const advance = async (status: JobStatus, patch: Partial<Job> = {}) => {
        await store.update(job.id, { status, ...patch });
    };

    const bill = (stage: string, usage: Usage, ok = true) => {
        ledger.add(stage, usage, ok ? 'completed' : 'failed');
        return usage.provider;
    };

    const persistSettled = async (settled: Job) => {
        if (!deps.persistSite) return;
        try {
            await deps.persistSite(settled);
        } catch (err) {
            console.warn('[generate] persist site', err instanceof Error ? err.message : err);
        }
    };

    try {
        await advance('planning');

        // Estimate on the short form brief so expand cannot flip every job to custom.
        const estimate = estimateSiteBuild(job.prompt);

        // Gemini expands the brief; Groq (prefer) builds from the detailed prompt.
        const expanded = await expandBrief(job.prompt);
        if (expanded.usage.model !== 'none') bill('expand', expanded.usage);
        const buildPrompt = expanded.data.expandedPrompt || job.prompt;
        if (expanded.data.expanded) {
            await store.update(job.id, { prompt: buildPrompt });
            await emit('plan', {
                mode: 'expand',
                expanded: true,
                chars: buildPrompt.length,
            });
        }

        const intent = await classify(buildPrompt);
        const provider = bill('classify', intent.usage);
        fallbackAttrs = {
            vertical: intent.data.vertical,
            category: intent.data.category,
            tone: intent.data.tone,
            palette: intent.data.palette,
            sections: intent.data.sections,
        };

        const budget = aiConfig();
        const composeAffordable = customBuildFits(estimate, {
            composeMaxTokens: budget.maxOutputTokens.compose,
            tpm: budget.quota.tpm,
        });

        if (estimate.mode === 'custom' && !composeAffordable) {
            console.warn(
                `[generate] job ${job.id}: custom compose needs `
                    + `${budget.maxOutputTokens.compose} output tokens against a `
                    + `${budget.quota.tpm} TPM limit — building with the section recipe instead.`,
            );
        }

        if (estimate.mode === 'custom' && composeAffordable) {
            await emit('plan', {
                mode: 'custom',
                band: estimate.band,
                estimatedTokens: estimate.estimatedTokens,
                reasons: estimate.reasons,
            });
            await advance('streaming', {
                provider,
                sectionsTotal: 1,
                ledger: [...ledger.all()],
            });

            const composed = await composeCustomSite(buildPrompt, intent.data);
            bill('compose', composed.usage);
            await emit('section', { type: 'custom', variant: 'files' });

            await advance('validating');
            await emit('validate');

            const composition = composed.data.composition;
            const variants = buildCustomStyleOptions(composition, composed.data.files);
            const picked = variants[0];
            const files = picked?.files ?? composed.data.files;
            const endedAt = Date.now();
            const current = (await store.get(job.id)) ?? job;
            const settled: Job = {
                ...current,
                status: 'done',
                composition: picked?.composition ?? composition,
                files,
                variants,
                endedAt,
                ledger: [...ledger.all()],
            };
            await persistSettled(settled);
            await emit('done');
            await advance('done', {
                composition: settled.composition,
                files,
                variants,
                endedAt,
                ledger: settled.ledger,
            });
            const done = (await store.get(job.id)) ?? job;
            deps.onSettled?.(done);
            return done;
        }

        const p = await fetchProfile(intent.data.vertical);
        bill('profile', p.usage);

        const planned = await plan(buildPrompt, intent.data, p.data);
        bill('plan', planned.usage);
        fallbackAttrs.sections = planned.data.map((section) => section.type);

        await emit('plan', {
            mode: 'recipe',
            sections: planned.data.length,
            types: planned.data.map((section) => section.type),
        });
        await advance('streaming', {
            provider,
            sectionsTotal: planned.data.length,
            ledger: [...ledger.all()],
        });

        const props = new Map<string, SectionProps>();

        for (const [i, section] of planned.data.entries()) {
            const ctx = {
                vertical: intent.data.vertical,
                tone: intent.data.tone,
                prompt: buildPrompt,
                customerWord: p.data.vocabulary.customer,
            };

            const outcome = await withOneRepair(async (repairContext) => {
                if (repairContext) await advance('repairing');
                try {
                    const filled = await fillSection(section, ctx, repairContext);
                    bill(`fill:${section.type}`, filled.usage);
                    return filled;
                } catch (err) {
                    const usage = usageFromError(err);
                    if (usage) bill(`fill:${section.type}`, usage, false);
                    throw err;
                }
            });

            if (outcome.repaired) await emit('repair', { section: section.type });

            props.set(section.id, outcome.data.data);
            const preview = previewFiles(planned.data, props, intent.data.vertical, p.data, buildPrompt, intent.data.tone);
            await advance('streaming', {
                sectionsDone: i + 1,
                ledger: [...ledger.all()],
                ...(preview ? { files: preview } : {}),
            });
            await emit('section', { type: section.type, variant: section.variant });
        }

        await advance('validating');
        await emit('validate');

        const assembled = assemble({
            vertical: intent.data.vertical,
            profile: p.data,
            sections: planned.data,
            props,
            title: p.data.label,
            description: buildPrompt.slice(0, 160),
            tone: intent.data.tone,
        });

        // D16: motion budget and diversity, repaired on the page about to be
        // shown rather than scored on a corpus afterwards. A samey page is
        // still a page — we restyle it; we never fail the job for looking
        // like its neighbours.
        const checked = checkAndRecord(assembled, { tone: intent.data.tone });
        const composition = checked.composition;

        if (checked.findings.length) {
            await emit('validate', {
                findings: checked.findings.map((f) => `${f.rule}: ${f.detail}`),
            });
            for (const f of checked.findings) {
                console.warn(`[composition] ${f.severity} ${f.rule} — ${f.detail}`);
            }
        }

        const variants = await buildStyleOptions(
            composition,
            (q) => lookupPhoto(q, job.id),
            buildPrompt,
            job.id,
        );
        const picked = variants[0];
        const files = picked?.files ?? compositionToFiles(composition);
        const endedAt = Date.now();
        const current = (await store.get(job.id)) ?? job;
        const settled: Job = {
            ...current,
            status: 'done',
            composition: picked?.composition ?? composition,
            files,
            variants,
            endedAt,
            ledger: [...ledger.all()],
        };
        // Persist the default look before marking the job done, so the editor
        // can open it without a Free / Pro / Premium picker in between.
        await persistSettled(settled);
        await emit('done');
        await advance('done', {
            composition: settled.composition,
            files,
            variants,
            endedAt,
            ledger: settled.ledger,
        });
        const done = (await store.get(job.id)) ?? job;
        deps.onSettled?.(done);
        return done;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        console.error(`[generate] job ${job.id} failed, falling back — ${message}`);

        const fallback = nearestTemplate(
            fallbackAttrs,
            deps.templates ?? [],
            message,
        );

        if (fallback) {
            const files = filesOf(fallback.template);
            const endedAt = Date.now();
            const current = (await store.get(job.id)) ?? job;
            await persistSettled({
                ...current,
                fallbackTemplateId: fallback.template.id,
                ...(files ? { files } : {}),
                error: message,
                status: 'done',
                endedAt,
                ledger: [...ledger.all()],
            });
            await emit('fallback', { templateId: fallback.template.id, reason: message });
            await advance('done', {
                fallbackTemplateId: fallback.template.id,
                ...(files ? { files } : {}),
                error: message,
                endedAt,
                ledger: [...ledger.all()],
            });
        } else {
            await emit('fallback', { reason: message });
            await advance('failed', {
                error: message,
                endedAt: Date.now(),
                ledger: [...ledger.all()],
            });
        }

        const ended = (await store.get(job.id)) ?? job;
        deps.onSettled?.(ended);
        return ended;
    } finally {
        const rows = [...ledger.all()];
        const usage = rows.reduce(
            (total, row) => ({
                inputTokens: total.inputTokens + row.inputTokens,
                outputTokens: total.outputTokens + row.outputTokens,
            }),
            { inputTokens: 0, outputTokens: 0 },
        );

        try {
            if (rows.length) await deps.recordUsage?.(usage);
        } catch (error) {
            console.error('[generation-spend] could not record usage', error);
        }

        try {
            await deps.persistLedger?.(rows);
        } catch (error) {
            console.error('[generation-ledger] could not persist rows', error);
        } finally {
            try {
                await deps.release?.();
            } catch (error) {
                console.error('[generation-guard] could not release concurrency slot', error);
            }
        }
    }
}

function usageFromError(err: unknown): Usage | undefined {
    const detail = (err as { detail?: { usage?: Usage } })?.detail;
    return detail?.usage;
}

function filesOf(template: RankableTemplate): FileMap | undefined {
    if (!template.files || Object.keys(template.files).length === 0) return undefined;
    return template.files;
}

/** Partial HTML as soon as a section has copy — live preview, not a spinner. */
function previewFiles(
    planned: readonly SectionInstance[],
    props: Map<string, SectionProps>,
    vertical: string,
    profile: VerticalProfile,
    prompt: string,
    tone?: Tone,
): FileMap | undefined {
    const filled = planned.filter((section) => props.has(section.id));
    if (filled.length === 0) return undefined;
    try {
        return compositionToFiles(assemble({
            vertical,
            profile,
            sections: filled,
            props,
            title: profile.label,
            description: prompt.slice(0, 160),
            tone,
        }));
    } catch {
        return undefined;
    }
}

function pickIndex(salt: string, length: number): number {
    if (length <= 1) return 0;
    let hash = 0;
    for (let i = 0; i < salt.length; i += 1) {
        hash = (hash * 31 + salt.charCodeAt(i)) >>> 0;
    }
    return hash % length;
}

// A whole page of results comes back and only items[0] was ever read, so every restaurant
// in the country got the same photograph and generating again returned it a second time.
// The salt is the job id, which is why two attempts differ and two businesses differ.
async function lookupPhoto(query: string, salt = ''): Promise<string> {
    try {
        const { isImageSearchConfigured, searchImages } = await import('@/lib/images/unsplash');
        if (!isImageSearchConfigured()) return bankPhotoUrl(query);
        const { items } = await searchImages(query, 1);
        if (!items.length) return bankPhotoUrl(query);
        return items[pickIndex(`${salt}:${query}`, items.length)]?.fullUrl ?? bankPhotoUrl(query);
    } catch {
        return bankPhotoUrl(query);
    }
}
