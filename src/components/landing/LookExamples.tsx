import type { CSSProperties } from "react";
import { CardIndex } from "@/components/ui/card-index";

const SHOP = {
    name: "Meera's Sweets",
    place: "Indiranagar",
    line: "Home-made mithai, packed the same morning.",
    cta: "See this week's box",
};

function Chrome({ children }: { children: React.ReactNode }) {
    return (
        <div
            aria-hidden
            className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-[0_18px_40px_rgba(0,0,0,0.28)]"
        >
            <div className="flex items-center gap-1.5 border-b border-border/40 bg-background/70 px-2.5 py-1.5">
                <span className="size-1.5 rounded-full bg-primary/80" />
                <span className="size-1.5 rounded-full bg-signal" />
                <span className="size-1.5 rounded-full bg-bloom-sky" />
                <span className="ml-1.5 truncate rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
                    meerasweets.in
                </span>
            </div>
            {children}
        </div>
    );
}

function CasualExample() {
    return (
        <Chrome>
            <div className="look-paper grid min-h-52 grid-cols-[1.05fr_0.95fr] gap-2 p-3">
                <div className="flex flex-col justify-center px-1 py-2">
                    <p className="look-paper-quiet text-[8px] font-semibold uppercase tracking-[0.28em]">
                        {SHOP.place}
                    </p>
                    <p className="mt-2 font-display text-[1.2rem] font-bold leading-tight tracking-tight">
                        {SHOP.name}
                    </p>
                    <p className="look-paper-muted mt-2 text-[10px] leading-4">{SHOP.line}</p>
                    <span className="look-paper-cta mt-3 w-fit rounded-full px-3 py-1.5 text-[9px] font-semibold">
                        {SHOP.cta}
                    </span>
                </div>
                <div
                    className="overflow-hidden rounded-xl"
                    style={{
                        background:
                            "linear-gradient(145deg, color-mix(in srgb, var(--brand) 55%, #f59e0b), color-mix(in srgb, var(--brand) 25%, #fdba74))",
                    }}
                >
                    <div className="flex h-full min-h-[9.5rem] items-end bg-[url('https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600&q=60&auto=format&fit=crop')] bg-cover bg-center">
                        <span className="w-full bg-gradient-to-t from-black/55 to-transparent px-2 pb-2 pt-6 text-[8px] font-medium text-white/90">
                            Fresh this morning
                        </span>
                    </div>
                </div>
            </div>
        </Chrome>
    );
}

function PhotoExample() {
    return (
        <Chrome>
            <div className="look-photo-hero relative flex min-h-52 flex-col justify-end overflow-hidden px-4 pb-4 pt-8">
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                <div className="relative">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.28em] text-white/75">
                        {SHOP.place}
                    </p>
                    <p className="mt-1 font-display text-[1.35rem] font-bold leading-tight text-white">
                        {SHOP.name}
                    </p>
                    <p className="mt-1.5 max-w-[13rem] text-[10px] leading-4 text-white/85">{SHOP.line}</p>
                    <div className="mt-4 grid grid-cols-3 gap-1.5">
                        {["The shop", "The box", "The counter"].map((caption) => (
                            <div key={caption} className="overflow-hidden rounded-md">
                                <div className="look-photo-tile h-10" />
                                <p className="bg-black/45 px-1 py-0.5 text-center text-[7px] tracking-wide text-white/80">
                                    {caption}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Chrome>
    );
}

function AnimatedExample() {
    return (
        <Chrome>
            <div className="look-motion relative flex min-h-52 flex-col justify-between overflow-hidden px-4 py-4">
                <span className="look-aurora pointer-events-none absolute -left-8 -top-10 size-36 rounded-full" />
                <span className="look-aurora-b pointer-events-none absolute -bottom-12 right-[-10%] size-40 rounded-full" />
                <p className="relative text-[8px] font-semibold uppercase tracking-[0.32em] text-bloom-sky">
                    {SHOP.place} · {SHOP.name}
                </p>
                <div className="relative">
                    <p className="hero-mix font-display text-[2.1rem] font-bold leading-[0.9] tracking-tight">
                        Mithai
                        <br />
                        tonight.
                    </p>
                    <p className="mt-3 max-w-[12rem] text-[10px] leading-4 text-white/75">{SHOP.line}</p>
                    <span className="mt-4 inline-flex rounded-full bg-primary px-3 py-1.5 text-[9px] font-semibold text-primary-foreground shadow-[0_0_18px_var(--brand-glow)]">
                        {SHOP.cta}
                    </span>
                </div>
                <p className="relative font-mono text-[8px] uppercase tracking-[0.22em] text-white/40">
                    Same words. This look moves.
                </p>
            </div>
        </Chrome>
    );
}

const LOOKS = [
    { label: "Casual", line: "Simple, colourful, and a little inviting — one photo up top.", Preview: CasualExample },
    { label: "Photo-rich", line: "Editorial type, a cinematic hero, and real photographs throughout the page.", Preview: PhotoExample },
    { label: "Animated", line: "A kinetic canvas — Bodoni display type, champagne gold, and motion from this business.", Preview: AnimatedExample },
];

export function LookExamples() {
    return (
        <ul className="grid gap-5 sm:grid-cols-3">
            {LOOKS.map((look, i) => (
                <li
                    key={look.label}
                    data-reveal
                    style={{ "--reveal": i + 1 } as CSSProperties}
                    className="glass-panel card-hover relative overflow-hidden rounded-2xl p-3"
                >
                    <CardIndex n={i + 1} />
                    <look.Preview />
                    <div className="relative z-[1] px-1 pb-1 pt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-ink">
                            {look.label}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-foreground">{look.line}</p>
                    </div>
                </li>
            ))}
        </ul>
    );
}
