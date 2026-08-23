"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

import type { ApiResult } from "@/lib/contracts";
import type { TemplatePreview as PreviewSpec } from "@/lib/discovery/preview";
import { CATEGORY_LABELS } from "@/lib/discovery/categories";
import { madeOfLine, type TemplateDetail } from "@/lib/templates/detail";
import { Badge } from "@/components/ui/badge";
import { UseDesignButton } from "./UseDesignButton";
import { LockedPlanNotice } from "./LockedPlanNotice";
import { buttonVariants } from "@/components/ui/button";
import { templateBadge } from "@/lib/payments/pricing";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { TemplatePreview } from "@/components/discovery/TemplatePreview";
import { cn } from "@/lib/utils";

// Screen 05 — the design's detail view, opened from a gallery tile.
//
// It is the last screen before someone commits to a design, which decides everything about
// it: the price sits beside the button that commits, stated in rupees before the choice and
// never after (UI Spec §7.18, Doc 22 P2/P3); a free design shows no price at all, because
// "Rs 0" would invent a transaction; and what the design is made of is described in what it
// gives the person, never in filenames (A1).
//
// Its data comes from GET /templates/{id} rather than from the tile that opened it. The
// gallery holds twelve templates: shipping every one's schema, provenance and manifest to
// the browser to populate a modal that opens at most once would be paid for by everyone and
// used by almost nobody. Fetching on open costs one request and is also how this will keep
// working when the library is a table rather than a module (D6).

// The miniature is drawn at one width and scaled, so the same design reads at desktop,
// tablet and phone widths without its type collapsing into specks at the small end.
const BASE_WIDTH = 560;
const ASPECT = 0.625; // 16:10, as the miniature is drawn

const DEVICES = [
    { label: "Desktop", width: 380 },
    { label: "Tablet", width: 180 },
    { label: "Phone", width: 110 },
] as const;

function DeviceFrame({
    label,
    width,
    preview,
}: {
    label: string;
    width: number;
    preview: PreviewSpec;
}) {
    const scale = width / BASE_WIDTH;

    return (
        <figure className="shrink-0" style={{ width }}>
            <div
                className="overflow-hidden rounded-lg border border-border bg-card"
                style={{ height: BASE_WIDTH * ASPECT * scale }}
            >
                <div
                    style={{
                        width: BASE_WIDTH,
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                    }}
                >
                    <TemplatePreview preview={preview} />
                </div>
            </div>
            <figcaption className="mt-1.5 text-center text-[11px] text-muted-foreground">
                {label}
            </figcaption>
        </figure>
    );
}

function Loading() {
    return (
        <div className="flex flex-col gap-4" aria-live="polite">
            <span className="sr-only">Loading this design</span>
            <div className="h-[238px] animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        </div>
    );
}

type State =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; detail: TemplateDetail }
    | { status: "error"; message: string };

export function TemplateDetailModal({
    templateId,
    templateName,
    children,
    showPrice = true,
    locked = false,
}: {
    templateId: string;
    templateName: string;
    children: React.ReactNode;
    showPrice?: boolean;
    locked?: boolean;
}) {
    const [state, setState] = useState<State>({ status: "idle" });

    const load = useCallback(async () => {
        setState({ status: "loading" });

        try {
            const response = await fetch(`/api/v1/templates/${encodeURIComponent(templateId)}`);

            // A reply arrived, so whatever went wrong is ours, not the network's. This used
            // to go straight to response.json(), which throws on a body that is not JSON —
            // and every such case landed in the catch below and told the person to check
            // their connection. A stale dev-server route table serving Next's own HTML 404
            // is exactly that shape: the connection was fine and the advice was wrong.
            const body = await response
                .json()
                .catch(() => null) as ApiResult<TemplateDetail> | null;

            if (!body) {
                setState({
                    status: "error",
                    message:
                        "We could not load this design just now. It is not something you did — try again in a moment.",
                });
                return;
            }

            setState(
                body.ok
                    ? { status: "ready", detail: body.data }
                    : { status: "error", message: body.error.message },
            );
        } catch {
            // Now only reached when the request never landed at all: offline, or a DNS
            // failure. Checking the connection is sound advice here and nowhere else.
            setState({
                status: "error",
                message: "We could not reach PageCrafts. Check your connection and try again.",
            });
        }
    }, [templateId]);

    // Fetched when it opens, not when the gallery renders, and kept once it arrives so
    // reopening the same design is instant.
    const onOpenChange = (open: boolean) => {
        if (open && state.status !== "ready" && state.status !== "loading") void load();
    };

    const detail = state.status === "ready" ? state.detail : null;
    const price =
        showPrice && detail && !locked && detail.tier !== "free" ? "Free" : null;
    const paidBadge = detail && locked ? templateBadge(detail.tier) : null;

    return (
        <Dialog onOpenChange={onOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>

            <DialogContent className="max-h-[92vh] w-[min(48rem,calc(100vw-2rem))] max-w-none overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{detail?.name ?? templateName}</DialogTitle>
                    <DialogDescription>
                        {detail?.description ?? "One moment — we're getting this design ready."}
                    </DialogDescription>
                </DialogHeader>

                {state.status === "loading" || state.status === "idle" ? <Loading /> : null}

                {state.status === "error" ? (
                    <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
                        <p className="text-sm text-foreground">{state.message}</p>
                        <button
                            type="button"
                            onClick={() => void load()}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                        >
                            Try again
                        </button>
                    </div>
                ) : null}

                {detail ? (
                    // min-w-0 all the way down from the dialog's grid: the preview frames
                    // are fixed pixel widths, and a grid item sized by its content would
                    // widen the whole modal on a phone rather than let the row scroll.
                    <div className="flex min-w-0 flex-col gap-6">
                        {/* The design at three sizes. Static miniatures, never a live
                            iframe (D-3, AC-F3-2).
                            min-w-0 matters: the frames are fixed pixel widths, and without
                            it this row sizes the dialog to its own content on a phone and
                            the small frames fall off the edge instead of scrolling. */}
                        <div className="-mx-1 flex min-w-0 items-end gap-4 overflow-x-auto px-1 pb-1">
                            {DEVICES.map((device) => (
                                <DeviceFrame
                                    key={device.label}
                                    label={device.label}
                                    width={device.width}
                                    preview={detail.preview}
                                />
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Badge variant="accent">{CATEGORY_LABELS[detail.category]}</Badge>
                            {detail.tags
                                .filter((tag) => tag !== detail.category)
                                .map((tag) => (
                                    <Badge key={tag} variant="outline">
                                        {tag}
                                    </Badge>
                                ))}
                        </div>

                        {/* Straight from content_schema, so a design cannot advertise a part
                            it has no field for, and nobody writes this list per template (C-07). */}
                        <section className="flex flex-col gap-2">
                            <h3 className="text-sm font-semibold text-foreground">
                                What you can change
                            </h3>
                            <ul className="flex flex-wrap gap-2">
                                {detail.editable.map((section) => (
                                    <li
                                        key={section.key}
                                        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground"
                                    >
                                        <span className="font-medium text-foreground">
                                            {section.label}
                                        </span>{" "}
                                        · {section.fields}{" "}
                                        {section.fields === 1 ? "thing" : "things"} to fill in
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-muted-foreground">
                                Everything here is yours to edit — text, photos and colours.{" "}
                                {madeOfLine(detail.files)}.
                            </p>
                        </section>

                        {/* Provenance (C-06). Small and plain: a credit, not a spec sheet.
                            It says where the design came from and nothing about what it
                            costs — a licence that is free to us is not a free design, and
                            putting the word "free" here would contradict the price sitting
                            two lines below it.

                            It also no longer says "comes from open source". Every design in
                            the library is first-party, written here, so that sentence was
                            telling a paying customer something untrue about where their site
                            came from (R2 D16 licence audit). The licence is still named,
                            because a design sourced from someone else's project will carry
                            theirs and that is the case this line exists for. */}
                        <p className="text-xs text-muted-foreground">
                            Licensed under {detail.license}.{" "}
                            <Link
                                href={detail.sourceUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="underline underline-offset-4 hover:text-foreground"
                            >
                                Where this design came from
                            </Link>
                        </p>

                        {/* The price sits beside the button it applies to, before the choice
                            and never after (UI Spec §7.18). Free designs carry no price. */}
                        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
                            {locked && paidBadge ? (
                                <LockedPlanNotice badge={paidBadge} kind="design" />
                            ) : (
                                <>
                                    {price ? (
                                        <span className="mr-auto flex flex-col">
                                            <span className="text-base font-semibold text-foreground">
                                                {price}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                Included in your plan
                                            </span>
                                        </span>
                                    ) : null}
                                    <UseDesignButton
                                        forkId={detail.forkId}
                                        name={detail.name}
                                        tier={detail.tier}
                                        showPayNote={showPrice}
                                        unlocked={!locked}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
