'use client';

import { Check } from 'lucide-react';

import type { GenerationStep } from '@/lib/editor/generation-steps';
import { cn } from '@/lib/utils';

export function GenerationTimeline({
    steps,
    thought,
    prompt,
    compact = false,
}: {
    steps: GenerationStep[];
    thought?: string | null;
    prompt?: string | null;
    compact?: boolean;
}) {
    return (
        <div className={cn('flex flex-col', compact ? 'gap-3' : 'gap-5')}>
            {compact ? null : (
                <header className="flex flex-col gap-3">
                    <p className="glass-pill w-fit font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-foreground">
                        <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
                        Live creation
                    </p>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">
                        Your site is <span className="hero-mix">appearing</span>
                    </h2>
                    {prompt ? (
                        <p className="text-sm leading-6 text-muted-foreground">
                            From your brief: {prompt}
                        </p>
                    ) : null}
                </header>
            )}

            <ol className={cn('flex flex-col', compact ? 'gap-2.5' : 'gap-3.5')}>
                {steps.map((step, index) => {
                    const last = index === steps.length - 1;
                    return (
                        <li key={step.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                                <StepMark step={step} />
                                {last ? null : (
                                    <span
                                        aria-hidden
                                        className={cn(
                                            'mt-1 w-px flex-1 min-h-4',
                                            step.state === 'done' ? 'bg-gold/50' : 'bg-border',
                                        )}
                                    />
                                )}
                            </div>
                            <p
                                className={cn(
                                    'pb-1 text-sm leading-5',
                                    step.state === 'pending'
                                        ? 'text-muted-foreground'
                                        : 'font-medium text-foreground',
                                )}
                                aria-current={step.state === 'active' ? 'step' : undefined}
                            >
                                {step.label}
                            </p>
                        </li>
                    );
                })}
            </ol>

            {thought ? (
                <p
                    role="status"
                    aria-live="polite"
                    className={cn(
                        'text-sm leading-6 text-muted-foreground',
                        compact ? 'mt-1' : 'glass-panel rounded-2xl px-3 py-2.5',
                    )}
                >
                    {thought}
                </p>
            ) : null}
        </div>
    );
}

function StepMark({ step }: { step: GenerationStep }) {
    if (step.state === 'done') {
        return (
            <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-gold text-gold-foreground"
            >
                <Check className="size-3" strokeWidth={2.5} />
            </span>
        );
    }

    if (step.state === 'active') {
        return (
            <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-bloom-sky bg-accent"
            >
                <span className="size-2 rounded-full bg-signal motion-safe:animate-pulse" />
            </span>
        );
    }

    return (
        <span
            aria-hidden
            className="size-5 shrink-0 rounded-full border border-border bg-muted"
        />
    );
}
