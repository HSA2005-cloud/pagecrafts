'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function AskAiFixDialog({
    open,
    title,
    what,
    busy = false,
    confirmLabel = 'Yes, do it',
    onConfirm,
    onDismiss,
}: {
    open: boolean;
    title: string;
    what: string;
    busy?: boolean;
    confirmLabel?: string;
    onConfirm: () => void;
    onDismiss: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onDismiss(); }}>
            <DialogContent className="border-border/70 bg-card/90 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="text-sm leading-6 text-muted-foreground">
                        {what} Would you like AI to do this for you?
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 cursor-pointer"
                        disabled={busy}
                        onClick={onDismiss}
                    >
                        Not now
                    </Button>
                    <Button
                        type="button"
                        variant="brand"
                        className="min-h-11 cursor-pointer"
                        disabled={busy}
                        onClick={onConfirm}
                    >
                        {busy ? 'Working…' : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
