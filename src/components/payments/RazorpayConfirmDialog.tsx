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
    | "edit_unlock"
    | "domain"
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
    edit_unlock: {
        title: "Continue to Razorpay?",
        body: "You'll pay Rs 249 to unlock editing on this live site. After that you can change it and republish to the same address. Agree only if you want to continue.",
    },
    domain: {
        title: "Continue to Razorpay?",
        body: "You'll pay for this domain. After payment we register it, point DNS, and put your site live on that address.",
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
        body: "You'll pay the price shown on the plan, after any applied coupon. Razorpay opens next unless the coupon made it free. Agree only if you want to continue.",
    },
    advanced: {
        title: "Continue to Razorpay?",
        body: "You'll pay the Advanced price shown on the page, after any applied coupon. Razorpay opens next unless the coupon made it free. Agree only if you want to continue.",
    },
    generation_pass: {
        title: "Continue to Razorpay?",
        body: "You'll pay the pass price shown on the page, after any applied coupon. Razorpay opens next unless the coupon made it free. Agree only if you want to continue.",
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
