import type { PreviewPalette, TemplatePreview as PreviewSpec } from "@/lib/discovery/preview";
import { MOTIFS } from "@/lib/templates/motifs";
import { atWidth, TILE_WIDTH, tileSrcSet } from "@/lib/discovery/image-size";
import type { MotifId, MotifShape } from "@/lib/templates/motifs";

// A miniature of the design, built from what the template itself declares — its
// navigation, hero copy, button label, layout and palette (see lib/discovery/preview.ts),
// and the same motif artwork its own index.html embeds (lib/templates/motifs.ts).
//
// Static: never a live iframe (D-3, AC-F3-2). Hidden from assistive tech, because the
// tile's real name, category and description sit around it at a readable size.
//
// It takes the parsed spec rather than the template, so the miniature can also be drawn
// from what GET /templates/{id} returns (the detail modal, D4) without the file bodies
// having to cross the wire to do it.

function MotifArt({
    motif,
    palette,
    className,
}: {
    motif: MotifId;
    palette: PreviewPalette;
    className?: string;
}) {
    const { viewBox, shapes } = MOTIFS[motif];

    const paint = (shape: MotifShape) => ({
        fill: shape.fill ? palette[shape.fill] : "none",
        stroke: shape.stroke ? palette[shape.stroke] : undefined,
        strokeWidth: shape.stroke ? (shape.strokeWidth ?? 1.5) : undefined,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        opacity: shape.opacity,
    });

    return (
        <svg viewBox={viewBox} preserveAspectRatio="none" className={className}>
            {shapes.map((shape, index) => {
                if (shape.kind === "circle") {
                    return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} {...paint(shape)} />;
                }
                if (shape.kind === "rect") {
                    return (
                        <rect
                            key={index}
                            x={shape.x}
                            y={shape.y}
                            width={shape.width}
                            height={shape.height}
                            rx={shape.rx ?? 0}
                            {...paint(shape)}
                        />
                    );
                }
                return <path key={index} d={shape.d} {...paint(shape)} />;
            })}
        </svg>
    );
}

function SearchGlyph({ color }: { color: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" className="size-2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </svg>
    );
}

export function TemplatePreview({
    preview,
    priority = false,
    orientation = "landscape",
}: {
    preview: PreviewSpec;
    /**
     * Set on the handful of tiles above the fold. Everything else waits until it is
     * scrolled towards — a gallery of twelve designs must not spend its first paint on
     * photographs nobody has looked at yet (NFR-001, first paint under 1.5s on 4G).
     */
    priority?: boolean;
    /** Portrait stacks the hero and copy for phone device frames in the detail modal. */
    orientation?: "landscape" | "portrait";
}) {
    const { wordmark, nav, headline, subhead, cta, layout, motif, heroImage, palette } = preview;
    const portrait = orientation === "portrait";

    // The design's own hero photograph where it ships one, drawn edge-to-edge so the tile
    // reads as the page it advertises; the code-drawn motif is the fallback for designs
    // that carry none. Decorative here — the tile's name and category sit around it.
    //
    // Width and height are declared so the browser reserves the space before the bytes
    // arrive: without them a lazy image lands into a collapsed box and shoves the grid
    // down as it loads. They are the miniature's own aspect (16:10), not the file's.
    const art = heroImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            // Asked for at tile size, not at the 1600px the design authors its hero at
            // (R2 D14). The stored template is untouched; only this request narrows.
            src={atWidth(heroImage, TILE_WIDTH)}
            {...(tileSrcSet(heroImage) ? { srcSet: tileSrcSet(heroImage)! } : {})}
            sizes={`${TILE_WIDTH}px`}
            alt=""
            aria-hidden
            width={portrait ? 390 : 640}
            height={portrait ? 844 : 400}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            {...(priority ? { fetchPriority: "high" as const } : {})}
            className="size-full object-cover"
        />
    ) : (
        <MotifArt motif={motif} palette={palette} className="size-full" />
    );

    const copy = (
        <>
            <p
                className={
                    portrait
                        ? "line-clamp-4 text-[11px] font-semibold leading-[1.15] tracking-tight"
                        : "line-clamp-3 text-[13px] font-semibold leading-[1.12] tracking-tight"
                }
                style={{ color: palette.ink }}
            >
                {headline}
            </p>
            <p
                className={
                    portrait
                        ? "mt-1.5 line-clamp-3 text-[7px] leading-[1.4]"
                        : "mt-1 line-clamp-2 text-[7px] leading-[1.4]"
                }
                style={{ color: palette.muted }}
            >
                {subhead}
            </p>
            {cta && (
                <span
                    className={
                        portrait
                            ? "mt-2.5 inline-block self-start rounded-[3px] px-2 py-1 text-[6px] font-semibold"
                            : "mt-2 inline-block self-start rounded-[3px] px-1.5 py-[3px] text-[6px] font-semibold"
                    }
                    style={{ backgroundColor: palette.accent, color: palette.bg }}
                >
                    {cta}
                </span>
            )}
        </>
    );

    const navLabels = portrait ? nav.slice(0, 2) : nav;

    return (
        <div
            aria-hidden
            className={
                portrait
                    ? "relative flex aspect-9/19.5 w-full flex-col overflow-hidden"
                    : "relative flex aspect-16/10 w-full flex-col overflow-hidden"
            }
            style={{ backgroundColor: palette.bg }}
        >
            {/* The template's own top bar: wordmark, its real navigation, search. */}
            <div
                className={
                    portrait
                        ? "relative z-10 flex items-center gap-1.5 px-2.5 pt-2"
                        : "relative z-10 flex items-center gap-2 px-3 pt-2.5"
                }
            >
                <span
                    className="truncate text-[8px] font-bold tracking-tight"
                    style={{ color: palette.ink }}
                >
                    {wordmark}
                </span>
                <span className="ml-auto flex items-center gap-1.5 overflow-hidden">
                    {navLabels.map((label) => (
                        <span key={label} className="whitespace-nowrap text-[6px]" style={{ color: palette.muted }}>
                            {label}
                        </span>
                    ))}
                </span>
                <SearchGlyph color={palette.muted} />
            </div>

            {portrait ? (
                <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 pt-1.5">
                    <div
                        className="h-[42%] w-full shrink-0 overflow-hidden rounded-md"
                        style={{ backgroundColor: palette.panel }}
                    >
                        {art}
                    </div>
                    <div className="mt-2 flex min-h-0 flex-1 flex-col">{copy}</div>
                </div>
            ) : null}

            {!portrait && layout === "split" ? (
                <div className="flex flex-1 items-center gap-3 px-3 pb-3 pt-2">
                    <div className="flex min-w-0 flex-1 flex-col">{copy}</div>
                    <div
                        className="h-full w-[42%] shrink-0 overflow-hidden rounded-md"
                        style={{ backgroundColor: palette.panel }}
                    >
                        {art}
                    </div>
                </div>
            ) : null}

            {!portrait && layout === "showcase" ? (
                <div className="flex flex-1 items-center gap-3 px-3 pb-3 pt-2">
                    <div
                        className="h-full w-[42%] shrink-0 overflow-hidden rounded-md"
                        style={{ backgroundColor: palette.panel }}
                    >
                        {art}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">{copy}</div>
                </div>
            ) : null}

            {!portrait && layout === "full-bleed" ? (
                <>
                    <div className="absolute inset-0" style={{ backgroundColor: palette.panel }}>
                        {art}
                    </div>
                    {/* The same scrim the template uses, so the copy stays readable. */}
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `linear-gradient(90deg, ${palette.bg} 12%, transparent 85%)`,
                        }}
                    />
                    <div className="relative z-10 flex flex-1 flex-col justify-center px-3 pb-3">
                        <div className="flex w-[68%] flex-col">{copy}</div>
                    </div>
                </>
            ) : null}

            {!portrait && layout === "centered" ? (
                <div className="flex flex-1 flex-col items-center px-3 pb-0 pt-2 text-center">
                    <div className="flex w-[82%] flex-col items-center [&>span]:self-center">{copy}</div>
                    <div
                        className="mt-2 h-[38%] w-full overflow-hidden rounded-t-md"
                        style={{ backgroundColor: palette.panel }}
                    >
                        {art}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
