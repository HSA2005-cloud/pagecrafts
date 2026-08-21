"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export type RazorpayConfirmKind =
    | "publish"
    | "design"
    | "look"
    | "plan"
    | "advanced"
    | "generation_pass";

const COPY: Record<RazorpayConfirmKind, { title: string; body: string }> = {
    publish: {
        title: "Continue to Razorpay?",
        body: "You'll be taken to Razorpay to pay for publishing this site. Agree only if you want to continue.",
    },
    design: {
        title: "Continue to Razorpay?",
        body: "You'll be taken to Razorpay to upgrade your plan so this design unlocks with its whole tier. Agree only if you want to continue.",
    },
    look: {
        title: "Continue to Razorpay?",
        body: "You'll be taken to Razorpay to upgrade your plan so this look unlocks with its whole tier. Agree only if you want to continue.",
    },
    plan: {
        title: "Continue to Razorpay?",
        body: "You'll be taken to Razorpay to upgrade to Pro or Premium. That unlocks every design and look in that plan — not just one template. Agree only if you want to continue.",
    },
    advanced: {
        title: "Continue to Razorpay?",
        body: "You'll be taken to Razorpay to pay for the Advanced AI package. Agree only if you want to continue.",
    },
    generation_pass: {
        title: "Continue to Razorpay?",
        body: "You'll be taken to Razorpay to pay for one extra AI generation. Agree only if you want to continue.",
    },
};

export function RazorpayConfirmDialog({
    open,
    kind,
    busy,
    onCancel,
    onAgree,
}: {
    open: boolean;
    kind: RazorpayConfirmKind;
    busy?: boolean;
    onCancel: () => void;
    onAgree: () => void;
}) {
    const copy = COPY[kind];

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && !busy) onCancel();
            }}
        >
            <DialogContent className="border-border/70 bg-card/90 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle>{copy.title}</DialogTitle>
                    <DialogDescription className="text-sm leading-6 text-muted-foreground">
                        {copy.body}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 cursor-pointer"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="brand"
                        className="min-h-11 cursor-pointer"
                        disabled={busy}
                        onClick={onAgree}
                    >
                        Agree
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
