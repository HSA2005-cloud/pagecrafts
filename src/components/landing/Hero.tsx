import { HeroPrompt } from "@/components/landing/HeroPrompt";

export function Hero() {
    return (
        <section data-reveal className="flex flex-col">
            <p className="glass-pill mb-6 w-fit font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-foreground">
                <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
                No code. Your words. Your site.
            </p>
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                <span className="text-foreground">Say it. </span>
                <span className="text-bloom-sky">See it </span>
                <span className="hero-gold">built.</span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
                Describe the website living in your head. PageCrafts turns those words into a
                real site — while it comes together in front of you.
            </p>

            <div className="mt-9 max-w-xl">
                <HeroPrompt />
            </div>
        </section>
    );
}
