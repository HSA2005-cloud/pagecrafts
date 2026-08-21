'use client';

import { FormEvent, useState } from 'react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { upiIssue } from '@/lib/sites/upi';

export function NeedUpiDialog({
    open,
    busy = false,
    error,
    onConfirm,
    onDismiss,
}: {
    open: boolean;
    busy?: boolean;
    error?: string | null;
    onConfirm: (upiId: string) => void;
    onDismiss: () => void;
}) {
    const [value, setValue] = useState('');
    const [issue, setIssue] = useState<string | null>(null);

    function submit(e?: FormEvent) {
        e?.preventDefault();
        const problem = upiIssue(value);
        if (problem) {
            setIssue(problem);
            return;
        }
        onConfirm(value.trim());
    }

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onDismiss(); }}>
            <DialogContent className="border-border/70 bg-card/90 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle>This site takes orders</DialogTitle>
                    <DialogDescription className="text-sm leading-6 text-muted-foreground">
                        We built the website. To take payments on it we need your UPI ID —
                        the address customers will send money to.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="grid gap-3">
                    <label htmlFor="owner-upi" className="text-sm font-medium">
                        Your UPI ID
                    </label>
                    <Input
                        id="owner-upi"
                        inputSize="lg"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="name@okaxis"
                        value={value}
                        aria-invalid={Boolean(issue || error)}
                        aria-describedby={issue || error ? 'owner-upi-issue' : undefined}
                        onChange={(e) => {
                            setValue(e.target.value);
                            setIssue(null);
                        }}
                    />
                    {issue || error ? (
                        <p id="owner-upi-issue" role="alert" className="text-sm text-brand-ink">
                            {issue ?? error}
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Looks like name@okaxis or your number@paytm. We only use it on this site.
                        </p>
                    )}
                    <DialogFooter className="pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 cursor-pointer"
                            disabled={busy}
                            onClick={onDismiss}
                        >
                            Skip for now
                        </Button>
                        <Button
                            type="submit"
                            variant="brand"
                            className="min-h-11 cursor-pointer"
                            disabled={busy}
                        >
                            {busy ? 'Saving…' : 'Save UPI ID'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
