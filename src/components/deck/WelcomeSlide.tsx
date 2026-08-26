import type { TemplateSummary } from "@/lib/templates/query";
import { TemplatePreview } from "@/components/discovery/TemplatePreview";
import { LiveBar } from "@/components/deck/LiveBar";
import { WelcomePrompt } from "@/components/deck/WelcomePrompt";

const FIELD = [
    {
        place: "left-[4%] top-[18%] w-[11.75rem] rotate-[-6deg]",
        depth: "near",
        show: "hidden sm:block",
        drift: "float-a",
    },
    {
        place: "right-[5%] top-[15%] w-[12.5rem] rotate-[5deg]",
        depth: "near",
        show: "hidden sm:block",
        drift: "float-b",
    },
    {
        place: "left-[2%] top-[48%] w-40 rotate-[7deg]",
        depth: "mid",
        show: "hidden md:block",
        drift: "float-c",
    },
    {
        place: "right-[2.5%] top-[46%] w-[9.75rem] rotate-[-5deg]",
        depth: "mid",
        show: "hidden md:block",
        drift: "float-a",
        glow: "gold",
    },
    {
        place: "left-[13%] bottom-[13%] w-[10.5rem] rotate-[-4deg]",
        depth: "mid",
        show: "hidden sm:block",
        drift: "float-b",
    },
    {
        place: "left-[26%] top-[12%] w-[6.5rem] rotate-[8deg]",
        depth: "far",
        show: "hidden lg:block",
        drift: "float-c",
    },
    {
        place: "right-[24%] top-[10%] w-24 rotate-[-7deg]",
        depth: "far",
        show: "hidden lg:block",
        drift: "float-a",
    },
    {
        place: "right-[14%] bottom-[12%] w-[6.75rem] rotate-[6deg]",
        depth: "far",
        show: "hidden md:block",
        drift: "float-b",
    },
] as const;

export function WelcomeSlide({
    name,
    templates,
}: {
    name: string;
    templates: TemplateSummary[];
}) {
    const chips = templates.slice(0, FIELD.length);

    return (
        <section
            id="welcome"
            className="page-slide pb-0 [justify-content:flex-start]"
            aria-labelledby="welcome-heading"
        >
            <div aria-hidden className="welcome-field">
                <span className="welcome-bloom bloom-blue -left-[10%] top-[2%] size-[22rem]" />
                <span
                    className="welcome-bloom bloom-sky right-[-8%] top-[-4%] size-[18rem] opacity-80"
                    style={{ animationDelay: "-7s" }}
                />
                <span
                    className="welcome-bloom bloom-amber right-[6%] bottom-[-8%] size-[16rem] opacity-55"
                    style={{ animationDelay: "-11s" }}
                />
                <svg
                    className="welcome-ribbons"
                    viewBox="0 0 1440 900"
                    preserveAspectRatio="xMidYMid slice"
                    fill="none"
                >
                    <defs>
                        <linearGradient id="welcome-ribbon-blue" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="var(--bloom-blue)" stopOpacity="0" />
                            <stop offset="48%" stopColor="var(--bloom-blue)" stopOpacity="0.9" />
                            <stop offset="100%" stopColor="var(--bloom-sky)" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="welcome-ribbon-gold" x1="1" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0" />
                            <stop offset="50%" stopColor="var(--bloom-amber)" stopOpacity="0.7" />
                            <stop offset="100%" stopColor="var(--mix-gold)" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <g className="site-ribbon-drift">
                        <path
                            d="M-90 200 C 300 70, 740 240, 1120 130 S 1480 70, 1700 210"
                            stroke="url(#welcome-ribbon-blue)"
                            strokeWidth="1.8"
                        />
                        <path
                            d="M-50 680 C 380 760, 860 560, 1240 700 S 1540 640, 1740 720"
                            stroke="url(#welcome-ribbon-gold)"
                            strokeWidth="1.25"
                        />
                    </g>
                </svg>
                <div className="site-grid" />
                <div className="site-grain" />
                <div className="welcome-vignette" />
            </div>

            <div aria-hidden className="welcome-chips">
                {chips.map((template, index) => {
                    const chip = FIELD[index]!;
                    const gold = "glow" in chip && chip.glow === "gold";
                    return (
                        <div
                            key={`${template.id}-${index}`}
                            className={`absolute ${chip.show} ${chip.place}`}
                        >
                            <div
                                className={`welcome-chip glass-panel welcome-chip-${chip.depth} ${chip.drift}${gold ? " welcome-chip-gold" : ""}`}
                            >
                                <ChipFace template={template} priority={chip.depth === "near"} />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="relative z-[1] flex min-h-0 flex-1 flex-col items-center justify-center px-6">
                <div className="flex w-full max-w-[40.625rem] flex-col items-center text-center [text-shadow:0_2px_28px_var(--background)]">
                    <h1
                        id="welcome-heading"
                        className="font-display text-[2.75rem] font-bold leading-[1.08] tracking-tight text-foreground sm:text-[3.5rem]"
                    >
                        Hello, <span className="hero-gold">{name}</span>
                    </h1>
                    <p className="mt-5 max-w-[38.75rem] text-lg leading-8 text-muted-foreground">
                        Pick a design you like, or tell us the name, the place, and what they
                        do. We write the pages from that. You edit in place, then go live free
                        on PageCrafts.
                    </p>
                    <div className="mt-8 w-full">
                        <WelcomePrompt />
                    </div>
                </div>
            </div>

            <div className="relative z-[1] mt-auto w-full shrink-0">
                <LiveBar />
            </div>
        </section>
    );
}

function ChipFace({
    template,
    priority,
}: {
    template: TemplateSummary;
    priority: boolean;
}) {
    if (template.thumbnailUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={template.thumbnailUrl}
                alt=""
                width={220}
                height={138}
                className="aspect-[16/10] w-full object-cover object-top"
            />
        );
    }

    return <TemplatePreview preview={template.preview} priority={priority} />;
}
