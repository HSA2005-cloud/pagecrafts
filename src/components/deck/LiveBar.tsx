const BEATS = [
    "Name · place · what they do",
    "AI writes every page",
    "Three looks from one brief",
    "Edit in place",
    "Go live free on PageCrafts",
];

export function LiveBar() {
    const ticker = [...BEATS, ...BEATS];

    return (
        <div className="overflow-hidden border-y border-border/60 py-3">
            <div className="look-marquee text-sm font-medium tracking-wide text-muted-foreground">
                {ticker.map((beat, i) => (
                    <span key={`${beat}-${i}`} className="flex items-center gap-3">
                        <span className="text-brand-ink">●</span>
                        {beat}
                    </span>
                ))}
            </div>
        </div>
    );
}
