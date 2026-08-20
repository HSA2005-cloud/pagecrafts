"use client";

import { useEffect, useState } from "react";

const APP_SLIDES = [
    { id: "welcome", label: "Welcome" },
    { id: "how-it-works", label: "How it works" },
    { id: "build", label: "Build" },
    { id: "sites", label: "Your sites" },
    { id: "settings", label: "Settings" },
] as const;

type Slide = { id: string; label: string };

export function SlideNav({
    slides,
    introOnly = false,
}: {
    slides?: readonly Slide[];
    introOnly?: boolean;
}) {
    const catalog: readonly Slide[] = introOnly
        ? [{ id: "top", label: "Intro" }]
        : (slides ?? APP_SLIDES);
    const [ids, setIds] = useState<string[]>(catalog.map((slide) => slide.id));
    const [active, setActive] = useState(catalog[0]?.id ?? "top");

    useEffect(() => {
        const present = catalog.filter((slide) => document.getElementById(slide.id));
        // The catalog is filtered against the document, which only exists after mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIds(present.map((slide) => slide.id));
        if (present[0] && !present.some((slide) => slide.id === active)) {
            setActive(present[0].id);
        }

        const io = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                const id = visible?.target.getAttribute("id");
                if (id && present.some((slide) => slide.id === id)) setActive(id);
            },
            { threshold: 0.35 },
        );

        present.forEach((slide) => {
            const el = document.getElementById(slide.id);
            if (el) io.observe(el);
        });
        return () => io.disconnect();
        // catalog identity is the slides/introOnly pair
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [introOnly, slides]);

    function go(id: string) {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const current = catalog.find((slide) => slide.id === active) ?? catalog[0];

    return (
        <nav
            aria-label="On this page"
            className="pointer-events-none fixed right-4 top-1/2 z-30 hidden -translate-y-1/2 md:block"
        >
            <div className="pointer-events-auto flex flex-col items-center gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-bloom-sky [writing-mode:vertical-rl] rotate-180">
                    {current?.label}
                </span>
                <span className="h-10 w-px bg-bloom-sky" aria-hidden />
                <ul className="flex flex-col items-center gap-3">
                    {catalog
                        .filter((slide) => ids.includes(slide.id))
                        .map((slide) => {
                            const on = slide.id === active;
                            return (
                                <li key={slide.id}>
                                    <button
                                        type="button"
                                        aria-current={on ? "true" : undefined}
                                        aria-label={slide.label}
                                        onClick={() => go(slide.id)}
                                        className={
                                            on
                                                ? "h-8 w-0.5 rounded-full bg-bloom-sky"
                                                : "size-1.5 rounded-full bg-foreground/30 hover:bg-foreground/55"
                                        }
                                    />
                                </li>
                            );
                        })}
                </ul>
            </div>
        </nav>
    );
}
