/** Smooth scroll to a home-deck slide without fighting scroll-snap. */
export function scrollToDeckSlide(id: string, { updateUrl = true }: { updateUrl?: boolean } = {}) {
    const el = document.getElementById(id);
    if (!el) {
        if (id === "compare") window.location.assign("/compare");
        return;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const html = document.documentElement;
    const hadSnap = html.classList.contains("deck-snap");
    if (hadSnap) html.classList.remove("deck-snap");

    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });

    if (updateUrl) {
        window.history.replaceState(null, "", `/?slide=${id}`);
    }

    if (hadSnap) {
        window.setTimeout(() => html.classList.add("deck-snap"), reduce ? 0 : 700);
    }
}
