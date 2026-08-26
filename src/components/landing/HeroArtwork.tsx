import type { TemplateSummary } from "@/lib/templates/query";
import { TemplatePreview } from "@/components/discovery/TemplatePreview";

/**
 * Landscape-first mosaic so 16:10 library thumbnails stay fully readable.
 * Tall portrait slots were cropping headlines (e.g. yoga "Breathe. Stretch…").
 */
const FRAMES = [
    {
        place: "inset-[5%_auto_auto_4%] h-[48%] w-[58%] rounded-2xl float-b",
        tone: "hero-shot",
    },
    {
        place: "inset-[8%_4%_auto_auto] h-[42%] w-[34%] rounded-2xl float-a",
        tone: "hero-shot-amber",
    },
    {
        place: "inset-[auto_auto_5%_4%] h-[36%] w-[31%] rounded-xl float-c",
        tone: "hero-shot",
    },
    {
        place: "inset-[auto_auto_5%_37%] h-[36%] w-[28%] rounded-xl",
        tone: "hero-shot-amber",
    },
    {
        place: "inset-[auto_4%_5%_auto] h-[36%] w-[31%] rounded-lg",
        tone: "hero-shot",
    },
] as const;

/**
 * Hero canvas: library designs that are not on the signed-in home face.
 * Presentational only — hidden from assistive tech.
 */
export function HeroArtwork({ templates }: { templates: TemplateSummary[] }) {
    return (
        <div aria-hidden className="hero-blueprint w-full max-w-2xl">
            {FRAMES.map((frame, index) => {
                const template = templates[index];
                if (!template) return null;
                return (
                    <span
                        key={template.id}
                        className={`absolute overflow-hidden ${frame.place} ${frame.tone}`}
                    >
                        <HeroFace template={template} />
                    </span>
                );
            })}
        </div>
    );
}

function HeroFace({ template }: { template: TemplateSummary }) {
    if (template.thumbnailUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={template.thumbnailUrl}
                alt=""
                width={640}
                height={400}
                className="absolute inset-0 size-full object-cover object-[center_12%]"
            />
        );
    }

    return (
        <div className="absolute inset-0 [&_>div]:h-full [&_>div]:w-full [&_>div]:aspect-auto">
            <TemplatePreview preview={template.preview} priority />
        </div>
    );
}
