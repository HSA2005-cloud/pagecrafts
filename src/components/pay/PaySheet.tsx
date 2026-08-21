'use client';

import { useState } from 'react';

import { BrandMark } from '@/components/landing/BrandMark';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { upiPayUri } from '@/lib/sites/upi';

export function PaySheet({
    businessName,
    upiId,
    amountInr,
    note,
}: {
    businessName: string;
    upiId: string;
    amountInr?: number;
    note?: string;
}) {
    const [copied, setCopied] = useState(false);
    const href = upiPayUri({
        upiId,
        payeeName: businessName,
        amountInr,
        note,
    });
    const amount = amountInr && amountInr > 0 ? `Rs ${Math.round(amountInr)}` : null;

    async function copy() {
        try {
            await navigator.clipboard.writeText(upiId);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            setCopied(false);
        }
    }

    return (
        <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-20">
            <BrandMark className="mb-8" />
            <article className="glass-panel rounded-3xl p-7 sm:p-8">
                <p className="glass-pill w-fit font-mono text-[11px] uppercase tracking-[0.22em] text-bloom-sky">
                    Pay with UPI
                </p>
                <h1 className="mt-5 font-display text-4xl font-bold tracking-tight">
                    Send this order to{' '}
                    <span className="hero-gold">{businessName}</span>
                </h1>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    Open your UPI app and pay the ID below. This page uses the same
                    PageCrafts look as the landing — not a blank white checkout.
                </p>
                {amount ? (
                    <p className="mt-4 text-lg font-semibold text-gold">{amount}</p>
                ) : null}
                <p className="mt-5 rounded-xl border border-border bg-field px-4 py-3 font-mono text-sm break-all">
                    {upiId}
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <a
                        href={href}
                        className={cn(
                            buttonVariants({ variant: 'brand', size: 'xl' }),
                            'min-h-11 flex-1 cursor-pointer',
                        )}
                    >
                        Pay with UPI
                    </a>
                    <Button
                        type="button"
                        variant="outline-brand"
                        size="xl"
                        className="min-h-11 cursor-pointer sm:w-40"
                        onClick={() => void copy()}
                    >
                        {copied ? 'Copied' : 'Copy ID'}
                    </Button>
                </div>
            </article>
        </main>
    );
}
