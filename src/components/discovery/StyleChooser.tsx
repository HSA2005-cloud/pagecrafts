"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, RefreshCw } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api/client";
import type { JobStatus } from "@/lib/ai/jobs/types";
import type { StyleId, StyleTier } from "@/lib/ai/generate/styles";
import { Button } from "@/components/ui/button";
import { CardIndex } from "@/components/ui/card-index";
import { GeneratingOverlay } from "@/components/editor/GeneratingOverlay";
import { cn } from "@/lib/utils";
import { useUpiPrompt } from "@/hooks/useUpiPrompt";
import { LockedPlanNotice } from "@/components/discovery/LockedPlanNotice";
import { AiCreditsNotice } from "@/components/discovery/AiCreditsNotice";
import { AskAiFixDialog } from "@/components/editor/AskAiFixDialog";
import { NeedUpiDialog } from "@/components/editor/NeedUpiDialog";
import { explainCreationIssue } from "@/lib/editor/ai-fix";
import { styleBadge, styleTileLabel } from "@/lib/payments/pricing";
import type { AccountPlan, BillingSummary } from "@/lib/contracts";
import { isOutOfAiCredits } from "@/lib/ai/jobs/credits";

interface VariantCard {
    id: StyleId;
    label: string;
    blurb: string;
    tier: StyleTier;
    price_inr: number;
    html: string;
}

interface Attempt {
    job_id: string;
    index: number;
    variants: VariantCard[];
}

interface Quota {
    used: number;
    limit: number;
    remaining: number;
    unlimited: boolean;
    plan?: AccountPlan;
    passes?: number;
    canGenerate?: boolean;
}

interface JobProgress {
    status: JobStatus;
    prompt?: string;
    sections_done: number;
    sections_total: number;
    files_ready?: boolean;
    planned_sections?: string[];
    preview_html?: string;
    fallback_template_id?: string;
    error?: string;
    variants?: VariantCard[];
    attempts?: Attempt[];
    quota?: Quota;
}

interface GenerateJobResponse {
    job_id: string;
}

const TIER_BADGE: Record<StyleTier, string> = {
    free: "border border-border bg-background text-foreground",
    pro: "bg-primary text-primary-foreground",
    premium: "brand-gradient text-primary-foreground",
};

function badgeClass(tier: StyleTier, unlocked: boolean): string {
    if (unlocked && tier !== "free") return TIER_BADGE.free;
    return TIER_BADGE[tier];
}

function canGenerateAgain(quota: Quota | null): boolean {
    if (!quota) return true;
    if (typeof quota.canGenerate === "boolean") return quota.canGenerate;
    return quota.unlimited || quota.remaining > 0 || (quota.passes ?? 0) > 0;
}

export function StyleChooser({
    projectId,
    jobId,
}: {
    projectId: string;
    jobId?: string;
}) {
    const router = useRouter();
    const [activeJobId, setActiveJobId] = useState(jobId);
    const [progress, setProgress] = useState<JobProgress | null>(
        jobId ? { status: "queued", sections_done: 0, sections_total: 0 } : null,
    );
    const [attempts, setAttempts] = useState<Attempt[]>([]);
    const [activeSetIndex, setActiveSetIndex] = useState(1);
    const [quota, setQuota] = useState<Quota | null>(null);
    const [prompt, setPrompt] = useState("");
    const [picking, setPicking] = useState<{ jobId: string; variantId: StyleId } | null>(null);
    const [regenerating, setRegenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outOfCredits, setOutOfCredits] = useState(false);
    const [unlockedStyles, setUnlockedStyles] = useState<string[]>([]);
    const [accountPlan, setAccountPlan] = useState<AccountPlan>("starter");
    const [askOpen, setAskOpen] = useState(false);
    const upi = useUpiPrompt({
        projectId,
        prompt,
        html: progress?.preview_html ?? progress?.variants?.[0]?.html,
        enabled: Boolean(progress && (progress.status === "done" || progress.status === "failed")),
    });
    const fix = error ? explainCreationIssue(error, "generation") : null;

    useEffect(() => {
        let cancelled = false;
        void apiGet<BillingSummary>("/api/v1/account/billing").then(({ data }) => {
            if (!cancelled && data) {
                setUnlockedStyles(data.unlockedStyleIds);
                setAccountPlan(data.plan);
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!activeJobId) {
            router.replace(`/editor/${encodeURIComponent(projectId)}`);
            return;
        }

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const poll = async () => {
            const { data, error: failure } = await apiGet<JobProgress>(
                `/api/v1/jobs/${encodeURIComponent(activeJobId)}`,
            );
            if (cancelled) return;

            if (failure || !data) {
                setError(failure ?? "That generation could not be found.");
                setProgress(null);
                return;
            }

            setProgress(data);
            if (data.prompt) setPrompt(data.prompt);
            if (data.quota) setQuota(data.quota);
            if (data.attempts?.length) {
                setAttempts(data.attempts);
                setActiveSetIndex(data.attempts[data.attempts.length - 1]!.index);
            }

            if (data.status === "failed") {
                setError(data.error ?? "The site could not be generated.");
                return;
            }

            if (data.status !== "done") {
                timer = setTimeout(poll, 1500);
                return;
            }

            const hasLooks = (data.attempts?.length ?? 0) > 0 || (data.variants?.length ?? 0) > 0;
            if (!hasLooks && data.fallback_template_id) {
                router.replace(
                    `/editor/${encodeURIComponent(projectId)}`,
                );
            }
        };

        void poll();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [activeJobId, projectId, router]);

    function lookUnlocked(tier: StyleTier, id: StyleId): boolean {
        if (!styleBadge(tier)) return true;
        return unlockedStyles.includes(id);
    }

    async function persistLook(fromJobId: string, variantId: StyleId) {
        return apiPost<{ id: string }>(
            `/api/v1/projects/${encodeURIComponent(projectId)}/generate/choose`,
            { jobId: fromJobId, variantId },
        );
    }

    async function choose(fromJobId: string, variantId: StyleId, tier: StyleTier) {
        if (picking) return;
        if (styleBadge(tier) && !lookUnlocked(tier, variantId)) {
            setError(
                `This is a ${styleBadge(tier)} look. Open User Plans to upgrade, then come back and pick it.`,
            );
            return;
        }
        await finishChoose(fromJobId, variantId);
    }

    async function finishChoose(fromJobId: string, variantId: StyleId) {
        setPicking({ jobId: fromJobId, variantId });
        setError(null);

        try {
            const result = await persistLook(fromJobId, variantId);

            if (result.code === "payment_required") {
                setError(
                    result.error
                    ?? "This look needs Pro or Premium. Open User Plans to upgrade.",
                );
                setPicking(null);
                return;
            }

            if (result.error) {
                setError(result.error);
                setPicking(null);
                return;
            }

            router.push(`/editor/${encodeURIComponent(projectId)}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save that look.");
            setPicking(null);
        }
    }

    /**
     * Start another generation.
     * Always keep the person's original site description as the prompt.
     * "Fix with AI" used to pass a repair sentence as the prompt, which replaced
     * the brief and made retries fail or build the wrong site.
     */
    async function generateAgain(_repairNote?: string) {
        const text = prompt.trim();
        if (!text || regenerating) return;
        if (!canGenerateAgain(quota)) {
            setOutOfCredits(true);
            setError(null);
            return;
        }
        setRegenerating(true);
        setError(null);
        setOutOfCredits(false);

        const started = await apiPost<GenerateJobResponse>(
            `/api/v1/projects/${encodeURIComponent(projectId)}/generate`,
            { prompt: text },
        );

        if (started.error || !started.data) {
            if (isOutOfAiCredits(started.code, started.error)) {
                setOutOfCredits(true);
                setError(null);
            } else {
                setError(started.error ?? "The site could not be generated.");
            }
            setRegenerating(false);
            return;
        }

        setProgress({ status: "queued", sections_done: 0, sections_total: 0 });
        setActiveJobId(started.data.job_id);
        router.replace(
            `/choose/${encodeURIComponent(projectId)}?job=${encodeURIComponent(started.data.job_id)}`,
        );
        setRegenerating(false);
    }

    const live = Boolean(progress && progress.status !== "done" && progress.status !== "failed");
    const [holdingLive, setHoldingLive] = useState(live);
    if (live && !holdingLive) {
        setHoldingLive(true);
    }

    useEffect(() => {
        if (live || !holdingLive) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const timer = window.setTimeout(() => setHoldingLive(false), reduce ? 0 : 880);
        return () => window.clearTimeout(timer);
    }, [live, holdingLive]);
    const lookSets = attempts.length
        ? attempts
        : progress?.status === "done" && progress.variants?.length
            ? [{ job_id: activeJobId ?? "", index: 1, variants: progress.variants }]
            : [];
    const visibleSets =
        lookSets.length > 1
            ? lookSets.filter((attempt) => attempt.index === activeSetIndex)
            : lookSets;
    const remaining = quota?.remaining ?? 0;
    const retryAllowed = canGenerateAgain(quota) && Boolean(prompt) && !live && !regenerating;
    const creditsSpent = outOfCredits || Boolean(quota && !canGenerateAgain(quota));
    const overlay = holdingLive && progress;

    return (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {overlay ? (
                <div
                    className={cn(
                        "absolute inset-0 z-10 flex min-h-0 flex-col",
                        !live && "stage-glide-out",
                    )}
                >
                    <GeneratingOverlay
                        className="min-h-0 flex-1"
                        status={progress.status}
                        sectionsDone={progress.sections_done}
                        sectionsTotal={progress.sections_total}
                        filesReady={Boolean(progress.files_ready)}
                        plannedSections={progress.planned_sections ?? []}
                        previewHtml={progress.preview_html}
                        looks={(progress.variants ?? []).map((look) => ({
                            id: look.id,
                            label: look.label,
                            html: look.html,
                        }))}
                        prompt={progress.prompt ?? prompt}
                        error={
                            outOfCredits
                                ? "You have used your AI generations on this site."
                                : (error ?? progress.error)
                        }
                        onAskAiFix={() => {
                            // Retry from the original brief. Passing the fix instruction as
                            // the prompt erased the business facts and rebuilt a generic site.
                            void generateAgain();
                        }}
                        showCreditsNotice={creditsSpent}
                    />
                </div>
            ) : null}

            {!live ? (
            <main
                className={cn(
                    "relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 pb-12 pt-4",
                    overlay && "stage-glide-in",
                )}
            >
            <header className="flex flex-col items-center gap-3 text-center">
                <p className="glass-pill w-fit font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-foreground">
                    <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
                    Three looks, one brief
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    Pick a <span className="hero-mix">look</span>
                </h1>
                <p className="max-w-xl text-sm text-muted-foreground">
                    {accountPlan === "premium"
                        ? "Same business, three different sites. Premium is active — every look is unlocked."
                        : accountPlan === "pro"
                          ? "Same business, three different sites. Pro is active — Casual is Free, Photo-rich is Pro unlocked. Animated needs Premium."
                          : "Same business, three different sites. Casual is Free. Photo-rich is Pro (Rs 499). Animated is Premium (Rs 999) — upgrade on User Plans to unlock paid looks."}
                </p>
            </header>

            {fix && !creditsSpent ? (
                <div className="mx-auto max-w-lg rounded-2xl border border-border/70 bg-card/80 p-4 text-center">
                    <p className="text-sm font-medium text-foreground">{fix.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{fix.what}</p>
                    {quota ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                            {canGenerateAgain(quota)
                                ? `AI credits left on this site: ${quota.remaining}${
                                      (quota.passes ?? 0) > 0
                                          ? ` (+ ${quota.passes} pass${quota.passes === 1 ? "" : "es"})`
                                          : ""
                                  }. See Settings → AI credits.`
                                : "No AI builds left on this site. See Settings → AI credits or upgrade on User Plans."}
                        </p>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => setAskOpen(true)}
                        className="mt-3 h-11 cursor-pointer rounded-full border border-gold bg-gold px-4 text-sm font-semibold text-gold-foreground hover:opacity-90"
                        disabled={!prompt.trim() || regenerating}
                    >
                        {regenerating ? "Starting again…" : "Fix with AI"}
                    </button>
                </div>
            ) : null}

            {creditsSpent ? (
                <AiCreditsNotice className="mx-auto max-w-lg" />
            ) : null}

            {error && !creditsSpent && !overlay ? (
                <div
                    role="alert"
                    className="mx-auto max-w-lg rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-sm text-foreground"
                >
                    <p className="font-semibold">{fix?.title ?? "That generation did not start"}</p>
                    <p className="mt-1 text-muted-foreground">{error}</p>
                </div>
            ) : null}

            {lookSets.length > 1 ? (
                <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-2">
                    <label htmlFor="look-set-picker" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Look set
                    </label>
                    <select
                        id="look-set-picker"
                        value={activeSetIndex}
                        onChange={(event) => setActiveSetIndex(Number(event.target.value))}
                        className="h-11 w-full cursor-pointer rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground"
                    >
                        {lookSets.map((attempt) => (
                            <option key={attempt.job_id || attempt.index} value={attempt.index}>
                                Set {attempt.index}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}

            {visibleSets.map((attempt) => (
                <section key={attempt.job_id || attempt.index} className="flex flex-col gap-3">
                    <ul className="look-chunk-grid grid grid-cols-1 gap-5 lg:grid-cols-3">
                        {attempt.variants.map((option, i) => {
                            const unlocked = lookUnlocked(option.tier, option.id);
                            const locked = !unlocked;
                            const badge = styleBadge(option.tier);
                            const tileLabel = styleTileLabel(option.tier, { unlocked });
                            return (
                            <li
                                key={`${attempt.job_id}-${option.id}`}
                                className="look-chunk-card"
                                style={{ animationDelay: `${i * 90}ms` }}
                            >
                                <article
                                    className={cn(
                                        "glass-panel card-hover relative flex h-full flex-col overflow-hidden rounded-2xl",
                                        option.tier === "premium" &&
                                            "shadow-[0_0_28px_color-mix(in_srgb,var(--gold)_28%,transparent)]",
                                    )}
                                >
                                    <CardIndex n={i + 1} />
                                    <div className="relative h-64 overflow-hidden bg-muted">
                                        <iframe
                                            title={`${option.label} preview`}
                                            srcDoc={option.html}
                                            sandbox="allow-scripts"
                                            tabIndex={-1}
                                            className={cn(
                                                "pointer-events-none absolute left-0 top-0 h-[220%] w-[180%] origin-top-left scale-[0.56] border-0 bg-transparent",
                                                locked && "opacity-55",
                                            )}
                                        />
                                        <span
                                            className={cn(
                                                "absolute right-2 top-2 z-[2] inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold shadow-sm",
                                                badgeClass(option.tier, unlocked),
                                            )}
                                        >
                                            {locked ? (
                                                <Lock className="size-3" strokeWidth={2} aria-hidden />
                                            ) : null}
                                            {tileLabel}
                                        </span>
                                    </div>
                                    <div className="relative z-[1] flex flex-1 flex-col gap-3 p-4">
                                        <div className="flex flex-col gap-1">
                                            <h2 className="text-base font-semibold text-foreground">
                                                {option.label}
                                            </h2>
                                            <p className="text-sm leading-5 text-muted-foreground">
                                                {option.blurb}
                                            </p>
                                        </div>
                                        {locked && badge ? (
                                            <LockedPlanNotice badge={badge} kind="look" />
                                        ) : (
                                            <Button
                                                variant={option.tier === "free" ? "outline-brand" : "brand"}
                                                className="mt-auto min-h-11 w-full cursor-pointer rounded-lg font-semibold"
                                                disabled={picking !== null}
                                                onClick={() =>
                                                    void choose(
                                                        attempt.job_id,
                                                        option.id,
                                                        option.tier,
                                                    )
                                                }
                                            >
                                                {picking?.jobId === attempt.job_id &&
                                                picking.variantId === option.id
                                                    ? "Setting up your site…"
                                                    : `Use ${option.label}`}
                                            </Button>
                                        )}
                                    </div>
                                </article>
                            </li>
                            );
                        })}
                    </ul>
                </section>
            ))}

            {lookSets.length > 0 && (
                <footer className="flex flex-col items-center gap-3 border-t border-border pt-6 text-center">
                    {retryAllowed ? (
                        <>
                            <p className="max-w-md text-sm text-muted-foreground">
                                {(quota?.passes ?? 0) > 0 && remaining <= 0
                                    ? `Not quite right? You have ${quota!.passes} extra generation ${quota!.passes === 1 ? "pass" : "passes"} left.`
                                    : remaining === 1
                                      ? "Not quite right? You have 1 AI generation left on this site."
                                      : `Not quite right? You have ${remaining} AI generations left on this site.`}
                            </p>
                            <Button
                                variant="outline-brand"
                                className="cursor-pointer rounded-lg font-semibold"
                                disabled={regenerating}
                                onClick={() => void generateAgain()}
                            >
                                <RefreshCw className="size-4" strokeWidth={1.75} />
                                {regenerating ? "Starting another look…" : "Generate another look"}
                            </Button>
                        </>
                    ) : creditsSpent ? (
                        <AiCreditsNotice className="max-w-lg" />
                    ) : null}
                </footer>
            )}
            </main>
            ) : null}

            {fix ? (
                <AskAiFixDialog
                    open={askOpen}
                    title={fix.title}
                    what={fix.what}
                    busy={regenerating}
                    onDismiss={() => setAskOpen(false)}
                    onConfirm={() => {
                        setAskOpen(false);
                        // Keep the stored brief — Fix with AI confirms a retry, it must not
                        // replace the business description with the repair sentence.
                        void generateAgain();
                    }}
                />
            ) : null}

            <NeedUpiDialog
                open={upi.open}
                busy={upi.busy}
                error={upi.error}
                onDismiss={upi.dismiss}
                onConfirm={(id) => {
                    void upi.save(id);
                }}
            />
        </div>
    );
}
