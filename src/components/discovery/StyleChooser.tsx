"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { apiGet, apiPost } from "@/lib/api/client";
import type { JobStatus } from "@/lib/ai/jobs/types";
import type { StyleId, StyleTier } from "@/lib/ai/generate/styles";
import { Button } from "@/components/ui/button";
import { CardIndex } from "@/components/ui/card-index";
import { GeneratingOverlay } from "@/components/editor/GeneratingOverlay";
import { cn } from "@/lib/utils";

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

const TIER_LABEL: Record<StyleTier, string> = {
    free: "Free",
    pro: "Pro",
    premium: "Premium",
};

const TIER_BADGE: Record<StyleTier, string> = {
    free: "border border-border bg-background text-foreground",
    pro: "bg-primary text-primary-foreground",
    premium: "brand-gradient text-primary-foreground",
};

function priceLabel(tier: StyleTier, priceInr: number): string {
    if (tier === "free") return "Free";
    return `Rs ${priceInr}`;
}

function canGenerateAgain(quota: Quota | null): boolean {
    if (!quota) return true;
    return quota.unlimited || quota.remaining > 0;
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
    const [quota, setQuota] = useState<Quota | null>(null);
    const [prompt, setPrompt] = useState("");
    const [picking, setPicking] = useState<{ jobId: string; variantId: StyleId } | null>(null);
    const [regenerating, setRegenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            if (data.attempts?.length) setAttempts(data.attempts);

            if (data.status === "failed") {
                setError(data.error ?? "The site could not be generated.");
                return;
            }

            if (data.status !== "done") {
                timer = setTimeout(poll, 400);
                return;
            }

            const hasLooks = (data.attempts?.length ?? 0) > 0 || (data.variants?.length ?? 0) > 0;
            if (!hasLooks && data.fallback_template_id) {
                router.replace(`/editor/${encodeURIComponent(projectId)}`);
            }
        };

        void poll();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [activeJobId, projectId, router]);

    async function choose(fromJobId: string, variantId: StyleId) {
        if (picking) return;
        setPicking({ jobId: fromJobId, variantId });
        setError(null);

        const { error: failure } = await apiPost<{ id: string }>(
            `/api/v1/projects/${encodeURIComponent(projectId)}/generate/choose`,
            { jobId: fromJobId, variantId },
        );

        if (failure) {
            setError(failure);
            setPicking(null);
            return;
        }

        router.push(`/editor/${encodeURIComponent(projectId)}`);
    }

    async function generateAgain() {
        if (!prompt || regenerating || !canGenerateAgain(quota)) return;
        setRegenerating(true);
        setError(null);

        const started = await apiPost<GenerateJobResponse>(
            `/api/v1/projects/${encodeURIComponent(projectId)}/generate`,
            { prompt },
        );

        if (started.error || !started.data) {
            const upgrade = /upgrade/i.test(started.error ?? "");
            setError(
                upgrade
                    ? "You have used your free generations. Pick one of the looks above, or upgrade to generate more."
                    : (started.error ?? "The site could not be generated."),
            );
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
    const remaining = quota?.remaining ?? 0;
    const retryAllowed = canGenerateAgain(quota) && Boolean(prompt) && !live && !regenerating;
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
                        error={error ?? progress.error}
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
                    Same business, three different sites. Casual is Free. Photo-rich will be Pro.
                    Animated will be Premium — for now you can use any of them.
                </p>
            </header>

            {error && (
                <p role="alert" className="text-center text-sm text-destructive">
                    {error}
                </p>
            )}

            {lookSets.map((attempt) => (
                <section key={attempt.job_id || attempt.index} className="flex flex-col gap-3">
                    {lookSets.length > 1 && (
                        <h2 className="text-sm font-semibold text-muted-foreground">
                            Set {attempt.index}
                        </h2>
                    )}
                    <ul className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                        {attempt.variants.map((option, i) => (
                            <li key={`${attempt.job_id}-${option.id}`}>
                                <article className="glass-panel card-hover relative flex h-full flex-col overflow-hidden rounded-2xl">
                                    <CardIndex n={i + 1} />
                                    <div className="relative h-64 overflow-hidden bg-muted">
                                        <iframe
                                            title={`${option.label} preview`}
                                            srcDoc={option.html}
                                            sandbox="allow-scripts"
                                            tabIndex={-1}
                                            className="pointer-events-none absolute left-0 top-0 h-[220%] w-[180%] origin-top-left scale-[0.56] border-0 bg-transparent"
                                        />
                                    </div>
                                    <div className="relative z-[1] flex flex-1 flex-col gap-3 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex flex-col gap-1">
                                                <h2 className="text-base font-semibold text-foreground">
                                                    {option.label}
                                                </h2>
                                                <p className="text-sm leading-5 text-muted-foreground">
                                                    {option.blurb}
                                                </p>
                                            </div>
                                            <span
                                                className={cn(
                                                    "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold",
                                                    TIER_BADGE[option.tier],
                                                )}
                                            >
                                                {TIER_LABEL[option.tier]}
                                            </span>
                                        </div>
                                        <Button
                                            variant={option.tier === "free" ? "outline-brand" : "brand"}
                                            className="mt-auto w-full cursor-pointer rounded-lg font-semibold"
                                            disabled={picking !== null}
                                            onClick={() => void choose(attempt.job_id, option.id)}
                                        >
                                            {picking?.jobId === attempt.job_id &&
                                            picking.variantId === option.id
                                                ? "Setting up your site…"
                                                : `Use ${option.label} · ${priceLabel(option.tier, option.price_inr)}`}
                                        </Button>
                                    </div>
                                </article>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}

            {lookSets.length > 0 && (
                <footer className="flex flex-col items-center gap-3 border-t border-border pt-6 text-center">
                    {retryAllowed ? (
                        <>
                            <p className="max-w-md text-sm text-muted-foreground">
                                {quota?.unlimited
                                    ? "Not quite right? Generate another set of looks."
                                    : remaining === 1
                                        ? "Not quite right? You have 1 free generation left."
                                        : `Not quite right? You have ${remaining} free generations left.`}
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
                    ) : quota && !quota.unlimited && quota.remaining <= 0 ? (
                        <p className="max-w-lg text-sm text-muted-foreground">
                            You have used your {quota.limit} free generations. Pick one of the looks
                            above, or upgrade to generate more.
                        </p>
                    ) : null}
                </footer>
            )}
            </main>
            ) : null}
        </div>
    );
}
