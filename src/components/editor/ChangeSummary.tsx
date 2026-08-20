'use client';
import { useEditorStore } from '@/lib/editor-store';

export default function ChangeSummary() {
    const pendingChange = useEditorStore((s) => s.pendingChange);
    const acceptChange = useEditorStore((s) => s.acceptChange);
    const rejectChange = useEditorStore((s) => s.rejectChange);

    if (!pendingChange) return null;

    return (
        <section
            aria-label="Suggested change"
            className="glass-panel flex shrink-0 flex-col rounded-2xl"
        >
            <header className="px-4 py-3">
                <p className="text-sm font-medium text-foreground">Suggested change</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{pendingChange.explanation}</p>
            </header>

            <footer className="flex items-center justify-end gap-3 border-t border-border/70 px-4 py-3">
                <button
                    type="button"
                    onClick={rejectChange}
                    className="h-11 cursor-pointer rounded-full border border-border px-4 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Discard
                </button>
                <button
                    type="button"
                    onClick={acceptChange}
                    className="h-11 cursor-pointer rounded-full border border-gold bg-gold px-4 text-sm font-semibold text-gold-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                    Keep this change
                </button>
            </footer>
        </section>
    );
}
