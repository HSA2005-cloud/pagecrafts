import { classify } from '../classify';
import { cachedProfile as fetchProfile } from '../profile-cache';
import { plan } from '../generate/plan';
import { fillSection } from '../generate/fill';
import { assemble } from '../generate/assemble';
import { compositionToFiles } from '../generate/to-files';
import { validateComposition } from '../composition/validate';
import { withOneRepair } from '../generate/repair';
import { nearestTemplate } from '../generate/fallback';
import { CostLedger } from '../cost/ledger';
import type { RankableTemplate } from '../rank';
import type { SectionProps, Usage } from '@/lib/contracts';
import { jobStore } from './store';
import type { Job, JobEventName, JobStatus } from './types';

export interface RunnerDeps {
    /** Candidates for the last-resort template fallback. */
    templates?: readonly RankableTemplate[];
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

    try {
        await advance('planning');

        const intent = await classify(job.prompt);
        const provider = bill('classify', intent.usage);

        const p = await fetchProfile(intent.data.vertical);
        bill('profile', p.usage);

        const planned = await plan(job.prompt, intent.data, p.data);
        bill('plan', planned.usage);

        await emit('plan', { sections: planned.data.length });
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
                prompt: job.prompt,
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
            await advance('streaming', { sectionsDone: i + 1, ledger: [...ledger.all()] });
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
            description: job.prompt.slice(0, 160),
        });

        // D16: motion budget and diversity, checked on the page about to be
        // shown rather than on a corpus afterwards. A motion repair changes the
        // art direction; a diversity finding is recorded and nothing more, since
        // a samey page is still a page and refusing to ship it helps nobody.
        const checked = validateComposition(assembled);
        const composition = checked.composition;

        if (checked.findings.length) {
            await emit('validate', {
                findings: checked.findings.map((f) => `${f.rule}: ${f.detail}`),
            });
            for (const f of checked.findings) {
                console.warn(`[composition] ${f.severity} ${f.rule} — ${f.detail}`);
            }
        }

        await emit('done');
        await advance('done', {
            composition,
            files: compositionToFiles(composition),
            endedAt: Date.now(),
            ledger: [...ledger.all()],
        });
        return (await store.get(job.id)) ?? job;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        const fallback = nearestTemplate(
            { category: undefined, sections: [] },
            deps.templates ?? [],
            message,
        );

        if (fallback) {
            await emit('fallback', { templateId: fallback.template.id, reason: message });
            await advance('done', {
                fallbackTemplateId: fallback.template.id,
                error: message,
                endedAt: Date.now(),
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

        return (await store.get(job.id)) ?? job;
    }
}

function usageFromError(err: unknown): Usage | undefined {
    const detail = (err as { detail?: { usage?: Usage } })?.detail;
    return detail?.usage;
}
