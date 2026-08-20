import { cn } from "@/lib/utils";

// The three steps of the funnel: describe what you want (screen 03), choose and
// customise a design (screen 04 → the editor), then publish. Progress only — the steps
// are not links, because you get to a step by finishing the one before it.
const STEPS = ["Describe", "Customize", "Publish"] as const;

export function FlowSteps({ current }: { current: 1 | 2 | 3 }) {
    return (
        <ol className="flex items-center gap-3" aria-label="Progress">
            {STEPS.map((label, index) => {
                const step = index + 1;
                const reached = step <= current;
                // The connector leaving the current step is lit: progress reads as coming
                // *out* of where you are, not as an edge that only fills once you arrive.
                const litConnector = index <= current;

                return (
                    <li key={label} className="flex items-center gap-3">
                        {index > 0 && (
                            <span
                                aria-hidden
                                className={cn(
                                    "hidden h-px w-10 sm:block xl:w-14",
                                    litConnector ? "bg-gold" : "bg-border",
                                )}
                            />
                        )}
                        <span className="flex items-center gap-2.5">
                            <span
                                aria-hidden
                                className={cn(
                                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                                    reached
                                        ? "bg-gold text-gold-foreground"
                                        : "border border-border text-muted-foreground",
                                )}
                            >
                                {step}
                            </span>
                            <span
                                className={cn(
                                    "text-sm font-medium",
                                    step === current
                                        ? "text-foreground"
                                        : "text-muted-foreground",
                                )}
                            >
                                {label}
                                {step === current && <span className="sr-only"> (current step)</span>}
                            </span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
