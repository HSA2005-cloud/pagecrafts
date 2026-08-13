import { classify } from '@/lib/ai/classify';
import { cachedProfile as fetchProfile } from '@/lib/ai/profile-cache';
import { plan } from '@/lib/ai/generate/plan';
import { fillSection } from '@/lib/ai/generate/fill';
import { assemble } from '@/lib/ai/generate/assemble';
import { compositionToFiles } from '@/lib/ai/generate/to-files';
import { validateComposition } from '@/lib/ai/composition/validate';
import { GatewayError } from '@/lib/ai/gateway';
import { CostLedger, type GenerationStatus, type LedgerRow } from '@/lib/ai/cost/ledger';
import { withOneRepair } from '@/lib/ai/generate/repair';
import type {
    Composition, FileMap, IntentAttributes, SectionInstance, SectionProps, Usage, VerticalProfile,
} from '@/lib/contracts';

export type Mode = 'mock' | 'plan-only' | 'full';

export interface CallRecord {
    stage: 'classify' | 'profile' | 'plan' | 'fill';
    section?: string;
    provider?: string;
    model: string;
    promptVersion?: string;
    structuredOutput?: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
}

export interface SpikeResult {
    vertical: string;
    prompt: string;
    hasTemplate: boolean;
    mode: Mode;
    ok: boolean;
    error?: string;
    detail?: unknown;
    composition?: Composition;
    /** Generated file tree, when the run produced a site. */
    files?: FileMap;
    /** What the classifier decided. Present whenever the classify stage returned. */
    intent?: IntentAttributes;
    partial?: {
        profile?: VerticalProfile;
        sections?: SectionInstance[];
    };
    calls: CallRecord[];
    requests: number;
    modelTimeMs: number;
    wallClockMs: number;
    ledger?: readonly LedgerRow[];
    spend?: {
        calls: number; inputTokens: number; outputTokens: number;
        costCents: number; failed: number;
    };
    /** Sections that needed their one permitted repair attempt (BR-09). */
    repairs?: string[];
}

export class BudgetExceeded extends Error { }

export class Budget {
    private used = 0;
    constructor(private readonly limit: number) { }

    spend(n = 1): void {
        if (this.used + n > this.limit) {
            throw new BudgetExceeded(
                `Budget exhausted: ${this.used}/${this.limit} used, ${n} requested.`,
            );
        }
        this.used += n;
    }

    refund(n = 1): void {
        this.used = Math.max(0, this.used - n);
    }

    get remaining(): number {
        return this.limit - this.used;
    }
}

function didNotConsumeQuota(err: unknown): boolean {
    const m = err instanceof Error ? err.message : String(err);
    return /\b503\b|UNAVAILABLE|ECONNRESET|fetch failed|aborted/i.test(m);
}

/** A validation failure still costs tokens — the service attaches the reply's usage. */
function usageFromError(err: unknown): Usage | undefined {
    if (err instanceof GatewayError && err.detail && typeof err.detail === 'object') {
        return (err.detail as { usage?: Usage }).usage;
    }
    return undefined;
}

interface SpikeInput {
    vertical: string;
    prompt: string;
    hasTemplate: boolean;
    mode: Mode;
    budget: Budget;
    /**
     * Which vertical the profile stage is asked for. The D5 spike pins it to the
     * corpus label so a classifier miss cannot contaminate a generation
     * measurement; the D11 quality pass wants `classified`, because the
     * classify → profile handoff is part of what is under test.
     */
    profileFrom?: 'input' | 'classified';
}

export async function generateSpike(input: SpikeInput): Promise<SpikeResult> {
    const { vertical, prompt, hasTemplate, mode, budget, profileFrom = 'input' } = input;
    const calls: CallRecord[] = [];
    const ledger = new CostLedger();
    const repairs: string[] = [];
    const startedAt = Date.now();

    let profileData: VerticalProfile | undefined;
    let plannedSections: SectionInstance[] | undefined;
    let intentData: IntentAttributes | undefined;

    const record = (
        stage: CallRecord['stage'],
        usage: Usage,
        section?: string,
        status: GenerationStatus = 'completed',
    ): void => {
        ledger.add(section ? `${stage}:${section}` : stage, usage, status);
        calls.push({
            stage,
            ...(section ? { section } : {}),
            provider: usage.provider,
            model: usage.model,
            promptVersion: usage.promptVersion,
            structuredOutput: usage.structuredOutput,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            latencyMs: usage.latencyMs,
        });
    };

    // A call that dispatched but failed validation still cost tokens, so it is
    // recorded rather than refunded. Only calls that never reached a provider are.
    const runStage = async <T extends { usage: Usage }>(
        stage: CallRecord['stage'],
        n: number,
        fn: () => Promise<T>,
        section?: string,
    ): Promise<T> => {
        if (mode !== 'mock') budget.spend(n);
        try {
            const result = await fn();
            record(stage, result.usage, section);
            return result;
        } catch (err) {
            const usage = usageFromError(err);
            if (usage) {
                record(stage, usage, section, 'failed');
            } else if (mode !== 'mock' && didNotConsumeQuota(err)) {
                budget.refund(n);
            }
            throw err;
        }
    };

    const base = {
        vertical, prompt, hasTemplate, mode,
        get calls() { return calls; },
    };

    try {
        const intent = await runStage('classify', 1, () => classify(prompt));
        intentData = intent.data;

        const profileVertical = profileFrom === 'classified' ? intent.data.vertical : vertical;

        const p = await runStage('profile', 1, () => fetchProfile(profileVertical));
        profileData = p.data;

        const planned = await runStage('plan', 1, () => plan(prompt, intent.data, p.data));
        plannedSections = planned.data;

        const props = new Map<string, SectionProps>();

        if (mode !== 'plan-only') {
            for (const section of planned.data) {
                const ctx = {
                    vertical: profileVertical,
                    tone: intent.data.tone,
                    prompt,
                    customerWord: p.data.vocabulary.customer,
                };

                const outcome = await withOneRepair((repairContext) =>
                    runStage(
                        'fill',
                        1,
                        () => fillSection(section, ctx, repairContext),
                        `${section.type}/${section.variant}`,
                    ));

                if (outcome.repaired) repairs.push(`${section.type}: ${outcome.firstError}`);
                props.set(section.id, outcome.data.data);
            }
        } else {
            for (const section of planned.data) props.set(section.id, {});
        }

        const assembled = assemble({
            vertical: profileVertical,
            profile: p.data,
            sections: planned.data,
            props,
            title: p.data.label,
            description: prompt.slice(0, 160),
        });
        const composition = validateComposition(assembled).composition;
        const files = mode === 'plan-only' ? undefined : compositionToFiles(composition);

        return {
            ...base,
            ok: true,
            composition,
            files,
            intent: intentData,
            calls,
            requests: calls.length,
            modelTimeMs: calls.reduce((t, c) => t + c.latencyMs, 0),
            wallClockMs: Date.now() - startedAt,
            ledger: ledger.all(),
            spend: ledger.totals,
            repairs,
        };
    } catch (err) {
        if (err instanceof BudgetExceeded) throw err;
        return {
            ...base,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            detail: err instanceof GatewayError ? err.detail : undefined,
            intent: intentData,
            partial: { profile: profileData, sections: plannedSections },
            calls,
            requests: calls.length,
            modelTimeMs: calls.reduce((t, c) => t + c.latencyMs, 0),
            wallClockMs: Date.now() - startedAt,
            ledger: ledger.all(),
            spend: ledger.totals,
            repairs,
        };
    }
}