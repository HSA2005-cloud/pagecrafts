"use client";

import { useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import type { Category, CreateProjectResponse } from "@/lib/contracts";
import { INTENT_CARDS } from "@/lib/discovery/intent-cards";
import { apiPost } from "@/lib/api/client";
import {
    briefErrors,
    briefFromQuery,
    composeBrief,
    emptyBrief,
    projectNameFromBrief,
    type SiteBrief,
} from "@/lib/ai/generate/brief";
import { Button } from "@/components/ui/button";
import { BriefFields } from "@/components/discovery/BriefFields";
import { cn } from "@/lib/utils";

const PENDING_PROMPT_KEY = "pagecrafts:pending-generate";
const PENDING_BRIEF_KEY = "pagecrafts:pending-brief";
const PENDING_TEMPLATE_KEY = "pagecrafts:pending-template";
const AUTO_GENERATE_KEY = "pagecrafts:auto-generate";

interface GenerateJobResponse {
    job_id: string;
}

function looksLikeSignIn(message: string): boolean {
    return /sign in/i.test(message);
}

function readStoredBrief(raw: string | null, fallbackPrompt: string): SiteBrief {
    if (raw) {
        try {
            const parsed = JSON.parse(raw) as Partial<SiteBrief>;
            return { ...emptyBrief(), ...parsed };
        } catch {
            // fall through
        }
    }
    return briefFromQuery(fallbackPrompt);
}

export function IntentCapture({
    initialDescribe = "",
    initialCategory = null,
    library = true,
    sourceTemplateId = null,
}: {
    initialDescribe?: string;
    initialCategory?: Category | null;
    library?: boolean;
    sourceTemplateId?: string | null;
} = {}) {
    const router = useRouter();
    const [brief, setBrief] = useState<SiteBrief>(() => briefFromQuery(initialDescribe));
    const [busy, setBusy] = useState<"generate" | Category | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fromDesign = Boolean(sourceTemplateId);

    function rememberAndSignIn(next: SiteBrief, text: string, templateId: string | null) {
        try {
            sessionStorage.setItem(PENDING_PROMPT_KEY, text);
            sessionStorage.setItem(PENDING_BRIEF_KEY, JSON.stringify(next));
            sessionStorage.setItem(AUTO_GENERATE_KEY, "1");
            if (templateId) sessionStorage.setItem(PENDING_TEMPLATE_KEY, templateId);
            else sessionStorage.removeItem(PENDING_TEMPLATE_KEY);
        } catch {
            // private mode can refuse storage; they can type it again after signing in
        }
        router.push("/signin");
    }

    async function startFromDesign(next: SiteBrief, templateId: string) {
        setBusy("generate");
        setError(null);

        const created = await apiPost<CreateProjectResponse>("/api/v1/projects", {
            name: projectNameFromBrief(next),
            sourceTemplateId: templateId,
            brief: {
                name: next.name,
                offer: next.offer,
                place: next.place,
                phone: next.phone,
                hours: next.hours,
                extra: next.extra,
            },
        });

        if (created.error || !created.data) {
            const message = created.error ?? "The site could not be created.";
            if (looksLikeSignIn(message)) {
                rememberAndSignIn(next, composeBrief(next), templateId);
                return;
            }
            setError(message);
            setBusy(null);
            return;
        }

        router.push(`/editor/${encodeURIComponent(created.data.id)}`);
    }

    async function startGeneration(next: SiteBrief) {
        setBusy("generate");
        setError(null);

        const text = composeBrief(next);
        const created = await apiPost<CreateProjectResponse>("/api/v1/projects", {
            name: projectNameFromBrief(next),
            mode: "generate",
            prompt: text,
        });

        if (created.error || !created.data) {
            const message = created.error ?? "The site could not be created.";
            if (looksLikeSignIn(message)) {
                rememberAndSignIn(next, text, null);
                return;
            }
            setError(message);
            setBusy(null);
            return;
        }

        const started = await apiPost<GenerateJobResponse>(
            `/api/v1/projects/${encodeURIComponent(created.data.id)}/generate`,
            { prompt: text },
        );

        if (started.error || !started.data) {
            setError(started.error ?? "The site could not be generated.");
            setBusy(null);
            return;
        }

        router.push(
            `/choose/${encodeURIComponent(created.data.id)}?job=${encodeURIComponent(started.data.job_id)}`,
        );
    }

    useLayoutEffect(() => {
        let pending = "";
        let storedBrief = "";
        let storedTemplate = "";
        let auto = false;
        try {
            pending = sessionStorage.getItem(PENDING_PROMPT_KEY) ?? "";
            storedBrief = sessionStorage.getItem(PENDING_BRIEF_KEY) ?? "";
            storedTemplate = sessionStorage.getItem(PENDING_TEMPLATE_KEY) ?? "";
            auto = sessionStorage.getItem(AUTO_GENERATE_KEY) === "1";
            if (pending) sessionStorage.removeItem(PENDING_PROMPT_KEY);
            if (storedBrief) sessionStorage.removeItem(PENDING_BRIEF_KEY);
            if (storedTemplate) sessionStorage.removeItem(PENDING_TEMPLATE_KEY);
            if (auto) sessionStorage.removeItem(AUTO_GENERATE_KEY);
        } catch {
            return;
        }

        if (!pending && !storedBrief) return;

        const restored = readStoredBrief(storedBrief, pending);
        // Restoring client-only state after mount — see the previous note on this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBrief(restored);
        if (auto && briefErrors(restored).length === 0) {
            const templateId = storedTemplate || sourceTemplateId;
            if (templateId) void startFromDesign(restored, templateId);
            else void startGeneration(restored);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function generate() {
        const problems = briefErrors(brief);
        if (problems.length) {
            setError(problems[0] ?? "Tell us a little more, then generate.");
            return;
        }
        if (sourceTemplateId) {
            await startFromDesign(brief, sourceTemplateId);
            return;
        }
        await startGeneration(brief);
    }

    function pickCategory(category: Category) {
        setBusy(category);
        router.push(`/templates?category=${category}`);
    }

    return (
        <div className="flex flex-col gap-7">
            <div className="w-full rounded-2xl glass-panel p-5 sm:p-6">
                <BriefFields
                    value={brief}
                    disabled={busy !== null}
                    onChange={(next) => {
                        setBrief(next);
                        if (error) setError(null);
                    }}
                />
                <div className="mt-5 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center">
                    {error ? (
                        <p role="alert" className="text-sm text-destructive sm:flex-1">
                            {error}
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground sm:flex-1">
                            We only put on the site what you tell us here.
                        </p>
                    )}
                    <Button
                        onClick={() => void generate()}
                        disabled={busy !== null}
                        variant="brand"
                        className="rounded-lg font-semibold sm:ml-auto"
                    >
                        {busy === "generate"
                            ? fromDesign
                                ? "Putting it on the design…"
                                : "Generating…"
                            : fromDesign
                              ? "Put this on the design"
                              : "Create my website"}
                        <ArrowRight aria-hidden />
                    </Button>
                </div>
            </div>

            {library && !fromDesign ? (
                <>
                    <div className="relative flex items-center justify-center">
                        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" aria-hidden />
                        <span className="relative rounded-full border border-border bg-background px-4 py-1 text-xs font-medium text-muted-foreground">
                            or start from a design
                        </span>
                    </div>

                    <section className="flex flex-col gap-4">
                        <header className="flex flex-col items-center gap-1 text-center">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">Choose a category</h2>
                            <p className="text-sm text-muted-foreground">
                                Browse a ready-made template instead of generating a new site
                            </p>
                        </header>

                        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
                            {INTENT_CARDS.map((card) => (
                                <button
                                    key={card.category}
                                    type="button"
                                    onClick={() => pickCategory(card.category)}
                                    disabled={busy !== null}
                                    aria-label={`${card.label}: ${card.description}`}
                                    className={cn(
                                        "group flex flex-col gap-2.5 rounded-2xl border bg-card p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                        initialCategory === card.category
                                            ? "border-primary"
                                            : "border-border hover:border-primary/50",
                                    )}
                                >
                                    <span className="block overflow-hidden rounded-xl">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={card.image}
                                            alt=""
                                            aria-hidden
                                            loading="lazy"
                                            className="aspect-3/2 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                    </span>
                                    <span className="flex flex-1 flex-col gap-1 px-1 pb-2">
                                        <span className="text-sm font-semibold text-foreground">{card.label}</span>
                                        <span className="text-xs leading-5 text-muted-foreground">{card.description}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                </>
            ) : null}
        </div>
    );
}
