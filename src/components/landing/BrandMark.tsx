import { cn } from "@/lib/utils";

export const BRAND_LOCKUP_SRC = "/brand/pagecrafts-lockup.png";
export const BRAND_NAME = "PageCrafts";

/** Official PageCrafts lockup: PC monogram, wordmark, and tagline. */
export function BrandMark({
    className,
    size = "header",
}: {
    className?: string;
    size?: "header" | "sidebar";
}) {
    return (
        <span className={cn("inline-flex items-center", className)}>
            {/* Native img so the lockup works in every shell without extra layout wrappers. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={BRAND_LOCKUP_SRC}
                alt={BRAND_NAME}
                width={496}
                height={161}
                className={cn(
                    "w-auto max-w-none bg-transparent object-contain object-left",
                    size === "sidebar" ? "h-14" : "h-11",
                )}
            />
        </span>
    );
}
