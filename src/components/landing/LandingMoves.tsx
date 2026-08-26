import type { CSSProperties } from "react";
import { CardIndex } from "@/components/ui/card-index";

const MOVES = [
    {
        title: "Describe the vibe",
        body: "Type it like you'd say it to a friend. Colours, mood, what they do — no jargon needed.",
    },
    {
        title: "Watch it build",
        body: "Pages, images and copy appear on the canvas as we write the site from your words.",
    },
    {
        title: "Nudge and publish",
        body: "“Warmer”, “bigger headline”, “add a menu”. Then go live on a PageCrafts address — free. Pro and Premium unlock richer looks.",
    },
];

export function LandingMoves() {
    return (
        <section id="moves" className="page-slide" aria-labelledby="moves-heading">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6">
                <h2
                    id="moves-heading"
                    data-reveal
                    className="max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl"
                >
                    Three moves from idea{" "}
                    <span className="text-bloom-sky">to</span>{" "}
                    <span className="hero-gold">online</span>
                </h2>

                <ul className="grid gap-5 sm:grid-cols-3">
                    {MOVES.map((move, i) => (
                        <li
                            key={move.title}
                            data-reveal
                            style={{ "--reveal": i } as CSSProperties}
                            className="glass-panel card-hover relative flex min-h-[16rem] flex-col overflow-hidden rounded-2xl p-6 sm:p-7"
                        >
                            <CardIndex n={i + 1} />
                            <h3 className="relative z-[1] text-xl font-semibold text-foreground">
                                {move.title}
                            </h3>
                            <p className="relative z-[1] mt-3 text-sm leading-6 text-muted-foreground">
                                {move.body}
                            </p>
                            <span className="card-tick relative z-[1]" aria-hidden />
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
