import { Globe, ShieldCheck, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { CardIndex } from "@/components/ui/card-index";

const PROPS = [
    {
        icon: Sparkles,
        step: "01",
        title: "Never a technical word",
        body: "No code, no accounts to connect, nothing to install. You describe the name, the place, and what they do — in plain English.",
    },
    {
        icon: ShieldCheck,
        step: "02",
        title: "You stay in charge",
        body: "Every change is shown to you first, and a version is saved before it happens. You cannot lose your work by exploring.",
    },
    {
        icon: Globe,
        step: "03",
        title: "A real site, at a real address",
        body: "Publishing gives you a live website we host for you. Building is free, and going live on a PageCrafts address is free. Pro and Premium unlock richer looks.",
    },
];

const SAY = [
    "Make the hero full-bleed",
    "Swap the colours for something warmer",
    "Add a contact form under the menu",
];

export function ValueProps() {
    return (
        <section
            id="how-it-works"
            aria-labelledby="how-it-works-heading"
            className="page-slide page-slide-tall"
        >
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 lg:gap-8">
                <header className="mx-auto max-w-2xl text-center">
                    <h2
                        id="how-it-works-heading"
                        className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
                    >
                        How it works
                    </h2>
                    <p className="mt-3 text-base leading-7 text-muted-foreground">
                        Tell us the business. We write every page. You pick a look, then change
                        anything by saying it — the site updates in front of you.
                    </p>
                </header>

                <div className="grid w-full gap-5 sm:grid-cols-3">
                    {PROPS.map(({ icon: Icon, step, title, body }, i) => (
                        <Card
                            key={title}
                            style={{ "--reveal": i } as CSSProperties}
                            className="glass-panel card-hover relative h-full overflow-hidden rounded-2xl"
                        >
                            <CardIndex n={step} />
                            <CardContent className="relative z-[1] flex flex-col gap-3 p-6 sm:p-7">
                                <span
                                    aria-hidden
                                    className="flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-accent"
                                >
                                    <Icon className="size-5 text-primary" strokeWidth={1.75} />
                                </span>
                                <CardTitle className="mt-1 text-lg">{title}</CardTitle>
                                <p className="text-sm leading-6 text-muted-foreground">{body}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="grid items-center gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
                    <div>
                        <h3 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            Editing feels like <span className="hero-mix">talking</span>
                        </h3>
                        <p className="mt-3 max-w-md text-base leading-7 text-muted-foreground">
                            Point at anything on the page and say what you want changed. Keep it or
                            throw it away. Nothing is applied until you say so.
                        </p>
                        <ul className="mt-4 flex flex-col gap-2.5">
                            {SAY.map((line) => (
                                <li
                                    key={line}
                                    className="glass-panel card-hover flex items-center gap-3 rounded-2xl px-4 py-3 font-mono text-sm text-foreground"
                                >
                                    <span className="text-signal" aria-hidden>
                                        →
                                    </span>
                                    {line}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <TalkCanvas />
                </div>
            </div>
        </section>
    );
}

function TalkCanvas() {
    return (
        <div className="glass-panel card-hover overflow-hidden rounded-3xl" aria-hidden>
            <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
                <span className="size-2 rounded-full bg-primary/80" />
                <span className="size-2 rounded-full bg-signal" />
                <span className="size-2 rounded-full bg-bloom-sky" />
                <span className="flex-1 text-center font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                    Live canvas
                </span>
            </div>
            <div className="relative px-6 py-6">
                <span className="look-aurora pointer-events-none absolute -right-8 top-2 size-28 rounded-full opacity-70" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-ink">
                    About
                </p>
                <p className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight text-foreground">
                    Meera&apos;s Sweets
                </p>
                <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                    A small kitchen in Indiranagar. Mithai packed the same morning, boxes from Rs
                    249.
                </p>
                <span className="mt-5 inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
                    See this week&apos;s box
                </span>
                <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-bloom-sky">
                    ● Writing the about page
                </p>
            </div>
        </div>
    );
}
