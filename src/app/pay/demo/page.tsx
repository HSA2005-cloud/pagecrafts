'use client';

import { useMemo, useState } from 'react';

import { SiteHeader } from '@/components/landing/SiteHeader';
import { BrandMark } from '@/components/landing/BrandMark';
import { AskAiFixDialog } from '@/components/editor/AskAiFixDialog';
import { NeedUpiDialog } from '@/components/editor/NeedUpiDialog';
import { PaySheet } from '@/components/pay/PaySheet';
import { Button } from '@/components/ui/button';
import { explainCreationIssue } from '@/lib/editor/ai-fix';
import { isOrderTakingSite } from '@/lib/sites/order-taking';
import { renderPayPageHtml, wireHtmlPayLinks } from '@/lib/sites/pay-page';
import { normaliseUpiId } from '@/lib/sites/upi';

const DEMO_PROMPT =
    'Order-taking website for Meera Sweets in Indiranagar. Menu, cart, and pay with UPI.';

const DEMO_SITE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Meera Sweets</title>
<style>
body{margin:0;font-family:system-ui;background:#111827;color:#f8fafc}
header,section{padding:2rem 1.25rem;max-width:40rem;margin:0 auto}
a.cta{display:inline-flex;min-height:44px;align-items:center;padding:0 1.1rem;border-radius:999px;background:#d4b56a;color:#05070a;font-weight:650;text-decoration:none}
.card{border:1px solid #334155;border-radius:1rem;padding:1rem;margin-top:1rem}
</style></head>
<body>
<header>
  <p style="opacity:.7;font-size:12px;letter-spacing:.2em;text-transform:uppercase">Live preview</p>
  <h1>Meera Sweets</h1>
  <p>Boxes from Rs 249 · Indiranagar. Order online and pay with UPI.</p>
  <p style="margin-top:1.25rem"><a class="cta" href="#">Order now</a></p>
</header>
<section>
  <div class="card"><strong>Kaju katli box</strong><p>Rs 499</p></div>
  <div class="card"><strong>Mysore pak tin</strong><p>Rs 349</p></div>
</section>
</body></html>`;

type Step = 'building' | 'upi' | 'site' | 'pay' | 'fix';

export default function PayDemoPage() {
    const [step, setStep] = useState<Step>('building');
    const [upiId, setUpiId] = useState('meera@okaxis');
    const [askOpen, setAskOpen] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [fixed, setFixed] = useState(false);

    const orderSite = isOrderTakingSite({ prompt: DEMO_PROMPT, html: DEMO_SITE });
    const fix = explainCreationIssue('Missing stylesheet: styles.css', 'preview');

    const previewHtml = useMemo(() => {
        const wired = wireHtmlPayLinks(DEMO_SITE, '#pay');
        if (!upiId) return wired;
        return `${wired}\n<!-- pay.html would be:\n${renderPayPageHtml({
            businessName: 'Meera Sweets',
            upiId,
            amountInr: 499,
        }).slice(0, 180)}… -->`;
    }, [upiId]);

    function startDemo() {
        setStep('building');
        window.setTimeout(() => setStep('upi'), 900);
    }

    function confirmUpi(value: string) {
        setUpiId(normaliseUpiId(value));
        setStep('site');
    }

    function runAiFix() {
        setAiBusy(true);
        window.setTimeout(() => {
            setAiBusy(false);
            setAskOpen(false);
            setFixed(true);
            setStep('site');
        }, 700);
    }

    return (
        <div className="relative min-h-dvh">
            <SiteHeader minimal />
            <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-20 lg:flex-row lg:items-start">
                <section className="w-full max-w-md shrink-0">
                    <BrandMark />
                    <h1 className="mt-8 font-display text-4xl font-bold tracking-tight">
                        Website creation <span className="hero-gold">preview</span>
                    </h1>
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                        Walk through an order-taking site: live build, UPI ask, themed pay page,
                        and the Fix with AI confirm instead of a raw error.
                    </p>
                    <ol className="mt-6 space-y-2 text-sm text-muted-foreground">
                        <li>1. Detect order-taking from the brief{orderSite ? ' — yes' : ''}.</li>
                        <li>2. Build the site, then ask for UPI.</li>
                        <li>3. Show pay page on the landing theme.</li>
                        <li>4. If something breaks, ask before AI fixes it.</li>
                    </ol>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Button variant="brand" className="min-h-11 cursor-pointer" onClick={startDemo}>
                            Run the flow
                        </Button>
                        <Button
                            variant="outline-brand"
                            className="min-h-11 cursor-pointer"
                            onClick={() => setStep('pay')}
                        >
                            Open pay page
                        </Button>
                        <Button
                            variant="outline"
                            className="min-h-11 cursor-pointer"
                            onClick={() => setStep('fix')}
                        >
                            Show AI fix
                        </Button>
                    </div>
                </section>

                <section className="min-w-0 flex-1">
                    {step === 'building' ? (
                        <div className="glass-panel rounded-3xl p-8">
                            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-bloom-sky">
                                Live rendering
                            </p>
                            <h2 className="mt-3 font-display text-2xl font-semibold">
                                Writing Meera Sweets…
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Menu, stories, and order buttons. The moment we know this takes
                                orders, we will ask for your UPI ID.
                            </p>
                            <div className="mt-6 h-2 overflow-hidden rounded-full bg-muted">
                                <div className="h-full w-2/3 animate-pulse rounded-full bg-gold" />
                            </div>
                        </div>
                    ) : null}

                    {step === 'site' || step === 'fix' ? (
                        <div className="glass-panel overflow-hidden rounded-3xl">
                            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Your site
                                </p>
                                <Button
                                    variant="brand"
                                    size="sm"
                                    className="cursor-pointer"
                                    onClick={() => setStep('pay')}
                                >
                                    Pay page
                                </Button>
                            </div>
                            <iframe
                                title="Demo site"
                                className="h-[28rem] w-full border-0 bg-card"
                                srcDoc={fixed ? previewHtml.replace('Missing', 'Ready') : previewHtml}
                            />
                            {step === 'fix' ? (
                                <div className="flex items-start justify-between gap-3 border-t border-border/60 px-4 py-3">
                                    <div>
                                        <p className="text-sm font-medium">{fix.title}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">{fix.what}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setAskOpen(true)}
                                        className="h-11 shrink-0 cursor-pointer rounded-full border border-gold bg-gold px-4 text-xs font-semibold text-gold-foreground"
                                    >
                                        Fix with AI
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {step === 'pay' ? (
                        <div className="overflow-hidden rounded-3xl border border-border/60">
                            <PaySheet
                                businessName="Meera Sweets"
                                upiId={upiId || 'meera@okaxis'}
                                amountInr={499}
                                note="Kaju katli box"
                            />
                        </div>
                    ) : null}
                </section>
            </main>

            <NeedUpiDialog
                open={step === 'upi'}
                onDismiss={() => setStep('site')}
                onConfirm={confirmUpi}
            />

            <AskAiFixDialog
                open={askOpen}
                title={fix.title}
                what={fix.what}
                busy={aiBusy}
                onDismiss={() => setAskOpen(false)}
                onConfirm={runAiFix}
            />
        </div>
    );
}
