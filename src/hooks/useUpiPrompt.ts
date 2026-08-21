'use client';

import { useEffect, useRef, useState } from 'react';

import { apiGet, apiPatch } from '@/lib/api/client';
import type { ProjectDetail } from '@/lib/contracts';
import { isOrderTakingSite } from '@/lib/sites/order-taking';
import { isValidUpiId, normaliseUpiId } from '@/lib/sites/upi';

function dismissKey(projectId: string): string {
    return `pagecraft.upi.skip.${projectId}`;
}

function skipped(projectId: string): boolean {
    try {
        return window.sessionStorage.getItem(dismissKey(projectId)) === '1';
    } catch {
        return false;
    }
}

function markSkipped(projectId: string) {
    try {
        window.sessionStorage.setItem(dismissKey(projectId), '1');
    } catch {
        /* session-only is enough */
    }
}

export function useUpiPrompt(opts: {
    projectId: string;
    prompt?: string | null;
    html?: string | null;
    vertical?: string | null;
    category?: string | null;
    enabled?: boolean;
}) {
    const enabled = opts.enabled ?? true;
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [upiId, setUpiId] = useState<string | null>(null);
    const asked = useRef(false);

    useEffect(() => {
        let cancelled = false;
        void apiGet<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(opts.projectId)}`).then(
            ({ data }) => {
                if (cancelled || !data) return;
                const stored = data.siteMeta.upiId?.trim();
                if (stored && isValidUpiId(stored)) setUpiId(normaliseUpiId(stored));
            },
        );
        return () => {
            cancelled = true;
        };
    }, [opts.projectId]);

    useEffect(() => {
        if (!enabled || asked.current || upiId || skipped(opts.projectId)) return;
        if (!isOrderTakingSite({
            prompt: opts.prompt,
            html: opts.html,
            vertical: opts.vertical,
            category: opts.category,
        })) {
            return;
        }
        asked.current = true;
        setOpen(true);
    }, [
        enabled,
        opts.projectId,
        opts.prompt,
        opts.html,
        opts.vertical,
        opts.category,
        upiId,
    ]);

    async function save(value: string) {
        setBusy(true);
        setError(null);
        const id = normaliseUpiId(value);
        const { data, error: failure } = await apiPatch<ProjectDetail>(
            `/api/v1/projects/${encodeURIComponent(opts.projectId)}`,
            { siteMeta: { upiId: id } },
        );
        if (failure || !data) {
            setBusy(false);
            setError(failure ?? 'The UPI ID could not be saved just now.');
            return false;
        }
        setUpiId(data.siteMeta.upiId ?? id);
        setBusy(false);
        setOpen(false);
        return true;
    }

    function dismiss() {
        markSkipped(opts.projectId);
        setOpen(false);
    }

    return { open, busy, error, upiId, save, dismiss };
}
