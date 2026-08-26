'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiGet, apiPost } from '@/lib/api/client';
import { useEditorStore } from '@/lib/editor-store';
import { cn } from '@/lib/utils';

type Tab = 'connect' | 'buy';

interface DnsRecord {
    type: string;
    host: string;
    value: string;
    note?: string;
}

interface DomainItem {
    id: string;
    projectId: string;
    name: string;
    source: string;
    status: string;
    records: DnsRecord[];
    failureReason: string | null;
}

interface SearchQuote {
    name: string;
    available: boolean;
    priceInr: number;
    renewalInr: number;
    quoteExpiresAt: string;
}

function statusLabel(status: string): string {
    if (status === 'live') return 'Live';
    if (status === 'failed') return 'Failed';
    if (status === 'pending_dns' || status === 'attaching') return 'Pending DNS';
    return status;
}

function statusClass(status: string): string {
    if (status === 'live') return 'border-emerald-600/40 bg-emerald-500/10 text-emerald-800';
    if (status === 'failed') return 'border-destructive/40 bg-destructive/10 text-destructive';
    return 'border-border bg-muted/60 text-muted-foreground';
}

async function copyText(value: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch {
        return false;
    }
}

export function CustomDomainDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const projectId = useEditorStore((s) => s.projectId);
    const [tab, setTab] = useState<Tab>('connect');
    const [published, setPublished] = useState<boolean | null>(null);
    const [domains, setDomains] = useState<DomainItem[]>([]);
    const [connectName, setConnectName] = useState('');
    const [buyQuery, setBuyQuery] = useState('');
    const [quote, setQuote] = useState<SearchQuote | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!projectId) return;
        setError(null);

        const [project, list] = await Promise.all([
            apiGet<{ liveUrl: string | null; status: string }>(
                `/api/v1/projects/${encodeURIComponent(projectId)}`,
            ),
            apiGet<{ items: DomainItem[] }>(
                `/api/v1/projects/${encodeURIComponent(projectId)}/domains`,
            ),
        ]);

        if (project.error) {
            setError(project.detail ?? project.error);
            setPublished(false);
            return;
        }

        const live =
            project.data?.status !== 'draft' ||
            Boolean(project.data?.liveUrl) ||
            (list.data?.items.length ?? 0) > 0;
        setPublished(live);

        if (list.error) {
            setError(list.detail ?? list.error);
            return;
        }
        setDomains(list.data?.items ?? []);
    }, [projectId]);

    useEffect(() => {
        if (!open) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch when dialog opens
        void load();
    }, [open, load]);

    async function handleConnect() {
        if (!projectId || !connectName.trim()) return;
        setBusy(true);
        setError(null);
        const result = await apiPost<DomainItem>(
            `/api/v1/projects/${encodeURIComponent(projectId)}/domains`,
            { name: connectName.trim() },
        );
        setBusy(false);
        if (result.error || !result.data) {
            setError(result.detail ?? result.error ?? 'Could not connect that domain.');
            return;
        }
        setConnectName('');
        setDomains((current) => [result.data!, ...current.filter((d) => d.id !== result.data!.id)]);
    }

    async function handleVerify(domainId: string) {
        if (!projectId) return;
        setBusy(true);
        setError(null);
        const result = await apiPost<DomainItem>(
            `/api/v1/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domainId)}/verify`,
            {},
        );
        setBusy(false);
        if (result.error || !result.data) {
            setError(result.detail ?? result.error ?? 'Could not check DNS.');
            return;
        }
        setDomains((current) =>
            current.map((item) => (item.id === result.data!.id ? result.data! : item)),
        );
    }

    async function handleSearch() {
        if (!buyQuery.trim()) return;
        setBusy(true);
        setError(null);
        setQuote(null);
        const result = await apiGet<SearchQuote>(
            `/api/v1/domains/search?q=${encodeURIComponent(buyQuery.trim())}`,
        );
        setBusy(false);
        if (result.error || !result.data) {
            setError(result.detail ?? result.error ?? 'Could not search that name.');
            return;
        }
        setQuote(result.data);
    }

    async function handleCopy(key: string, value: string) {
        const ok = await copyText(value);
        if (ok) {
            setCopied(key);
            window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto border-border/70 bg-card/95 backdrop-blur-xl sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Custom domain</DialogTitle>
                    <DialogDescription className="text-sm leading-6 text-muted-foreground">
                        Point a name you already own at this site, or look up a name to buy later.
                        Your free PageCrafts address stays live until a custom domain is verified.
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-2 flex gap-2" role="tablist" aria-label="Custom domain options">
                    {(
                        [
                            ['connect', 'Connect'],
                            ['buy', 'Buy'],
                        ] as const
                    ).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={tab === id}
                            onClick={() => setTab(id)}
                            className={cn(
                                'h-10 flex-1 cursor-pointer rounded-full border text-sm font-medium transition-colors',
                                tab === id
                                    ? 'border-foreground bg-foreground text-background'
                                    : 'border-border bg-transparent text-foreground hover:bg-accent',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {error ? (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                        {error}
                    </p>
                ) : null}

                {tab === 'connect' ? (
                    <div className="mt-4 space-y-4">
                        {published === false ? (
                            <p className="text-sm leading-6 text-muted-foreground">
                                Publish this site with Go Live first. Custom domains attach to your
                                live PageCrafts address.
                            </p>
                        ) : (
                            <>
                                <label className="block text-sm text-foreground">
                                    Domain you already own
                                    <input
                                        value={connectName}
                                        onChange={(e) => setConnectName(e.target.value)}
                                        placeholder="yourshop.in"
                                        disabled={busy || published === null}
                                        className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                                    />
                                </label>
                                <Button
                                    type="button"
                                    variant="brand"
                                    className="min-h-11 w-full cursor-pointer"
                                    disabled={busy || !connectName.trim() || published !== true}
                                    onClick={() => void handleConnect()}
                                >
                                    {busy ? (
                                        <>
                                            <Loader2 className="size-4 animate-spin" aria-hidden />
                                            Connecting…
                                        </>
                                    ) : (
                                        'Connect domain'
                                    )}
                                </Button>
                            </>
                        )}

                        {domains.length > 0 ? (
                            <ul className="space-y-3" aria-label="Connected domains">
                                {domains.map((domain) => (
                                    <li
                                        key={domain.id}
                                        className="rounded-2xl border border-border/70 bg-background/50 p-3"
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-medium text-foreground">
                                                {domain.name}
                                            </p>
                                            <span
                                                className={cn(
                                                    'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                                                    statusClass(domain.status),
                                                )}
                                            >
                                                {statusLabel(domain.status)}
                                            </span>
                                        </div>

                                        {domain.failureReason ? (
                                            <p className="mt-2 text-xs text-destructive">
                                                {domain.failureReason}
                                            </p>
                                        ) : null}

                                        {domain.records.length > 0 ? (
                                            <div className="mt-3 space-y-2">
                                                <p className="text-xs text-muted-foreground">
                                                    Add these records at your DNS host, then check
                                                    DNS. For apex names, use ALIAS / CNAME flattening,
                                                    or prefer www.
                                                </p>
                                                {domain.records.map((record, index) => {
                                                    const key = `${domain.id}-${index}`;
                                                    return (
                                                        <div
                                                            key={key}
                                                            className="rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-xs"
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0 space-y-1">
                                                                    <p>
                                                                        <span className="text-muted-foreground">
                                                                            Type
                                                                        </span>{' '}
                                                                        {record.type}
                                                                    </p>
                                                                    <p className="break-all">
                                                                        <span className="text-muted-foreground">
                                                                            Host
                                                                        </span>{' '}
                                                                        {record.host}
                                                                    </p>
                                                                    <p className="break-all">
                                                                        <span className="text-muted-foreground">
                                                                            Value
                                                                        </span>{' '}
                                                                        {record.value}
                                                                    </p>
                                                                    {record.note ? (
                                                                        <p className="text-muted-foreground">
                                                                            {record.note}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        void handleCopy(
                                                                            key,
                                                                            record.value,
                                                                        )
                                                                    }
                                                                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                                                                    aria-label={`Copy ${record.type} value`}
                                                                >
                                                                    {copied === key ? (
                                                                        <Check
                                                                            className="size-3.5"
                                                                            strokeWidth={2}
                                                                        />
                                                                    ) : (
                                                                        <Copy
                                                                            className="size-3.5"
                                                                            strokeWidth={1.75}
                                                                        />
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : null}

                                        {domain.status !== 'live' ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="mt-3 min-h-11 w-full cursor-pointer"
                                                disabled={busy}
                                                onClick={() => void handleVerify(domain.id)}
                                            >
                                                Check DNS
                                            </Button>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : (
                    <div className="mt-4 space-y-4">
                        <p className="text-sm leading-6 text-muted-foreground">
                            We register it for you and point DNS automatically after purchase.
                            Search and quote work now; checkout comes next.
                        </p>
                        <label className="block text-sm text-foreground">
                            Search a name
                            <input
                                value={buyQuery}
                                onChange={(e) => setBuyQuery(e.target.value)}
                                placeholder="yourshop.in"
                                disabled={busy}
                                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void handleSearch();
                                    }
                                }}
                            />
                        </label>
                        <Button
                            type="button"
                            variant="brand"
                            className="min-h-11 w-full cursor-pointer"
                            disabled={busy || !buyQuery.trim()}
                            onClick={() => void handleSearch()}
                        >
                            {busy ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" aria-hidden />
                                    Searching…
                                </>
                            ) : (
                                'Search'
                            )}
                        </Button>

                        {quote ? (
                            <div className="rounded-2xl border border-border/70 bg-background/50 p-3">
                                <p className="text-sm font-medium text-foreground">{quote.name}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {quote.available
                                        ? `Available · ₹${quote.priceInr} first year · renews at ₹${quote.renewalInr}`
                                        : 'Not available to register right now.'}
                                </p>
                                {quote.available ? (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Quote holds until{' '}
                                        {new Date(quote.quoteExpiresAt).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                        .
                                    </p>
                                ) : null}
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="mt-3 min-h-11 w-full cursor-not-allowed opacity-60"
                                    disabled
                                >
                                    Coming soon — purchase not wired yet
                                </Button>
                            </div>
                        ) : null}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
