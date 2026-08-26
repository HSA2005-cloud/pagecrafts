"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export type DiscountPreviewKind = "pro" | "premium" | "advanced" | "generation_pass";

export interface DiscountPreview {
    priceInr: number;
    listPriceInr: number;
    discountPercent?: number;
}

export interface AppliedCoupon {
    code: string;
    prices: Partial<Record<DiscountPreviewKind, DiscountPreview>>;
}

function compactCode(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function codesMatch(left: string, right: string): boolean {
    return compactCode(left) === compactCode(right) && compactCode(left).length > 0;
}

export function DiscountCodeField({
    kind,
    kinds,
    value,
    onChange,
    onApplied,
    className,
}: {
    kind: DiscountPreviewKind;
    kinds?: DiscountPreviewKind[];
    value: string;
    onChange: (value: string) => void;
    onApplied: (applied: AppliedCoupon | null) => void;
    className?: string;
}) {
    const [hint, setHint] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [appliedCode, setAppliedCode] = useState<string | null>(null);

    const toCheck = kinds && kinds.length > 0 ? kinds : [kind];

    async function apply() {
        const code = value.trim();
        if (!code) {
            setHint("Paste a coupon, then press Apply.");
            onApplied(null);
            setAppliedCode(null);
            return;
        }

        setChecking(true);
        setHint(null);

        const prices: AppliedCoupon["prices"] = {};
        let lastError: string | null = null;

        for (const previewKind of toCheck) {
            const { data, error } = await apiPost<DiscountPreview>("/api/v1/payments/discount/preview", {
                code,
                kind: previewKind,
            });

            if (error || !data) {
                lastError = error ?? "That code could not be checked.";
                continue;
            }

            prices[previewKind] = data;
        }

        setChecking(false);

        const hits = Object.values(prices);
        if (hits.length === 0) {
            setAppliedCode(null);
            onApplied(null);
            setHint(lastError ?? "That code could not be applied.");
            return;
        }

        const sample = hits.find((item) => item.discountPercent && item.priceInr < item.listPriceInr) ?? hits[0]!;
        const applied: AppliedCoupon = { code, prices };
        setAppliedCode(code);
        onApplied(applied);

        if (sample.priceInr === 0) {
            setHint(
                `Applied: ${sample.discountPercent ?? 100}% off. The plan shows Rs 0 — Razorpay will not open.`,
            );
            return;
        }

        setHint(
            `Applied: ${sample.discountPercent ?? 0}% off. Prices below are updated — then continue to Razorpay.`,
        );
    }

    return (
        <div className={cn("space-y-2", className)}>
            <label htmlFor="scratch-card-code" className="text-sm font-medium text-foreground">
                Coupon code
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                    id="scratch-card-code"
                    name="discountCode"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="PC-XXXX-XXXX"
                    value={value}
                    onChange={(event) => {
                        const next = event.target.value;
                        onChange(next);
                        setHint(null);
                        if (appliedCode && !codesMatch(appliedCode, next)) {
                            setAppliedCode(null);
                            onApplied(null);
                        }
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            void apply();
                        }
                    }}
                    className="font-mono uppercase sm:flex-1"
                />
                <Button
                    type="button"
                    variant="outline-brand"
                    className="min-h-11 shrink-0 cursor-pointer px-5"
                    disabled={checking || !value.trim()}
                    onClick={() => void apply()}
                >
                    {checking ? "Applying…" : "Apply"}
                </Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
                Paste the code, press Apply, and check the new price. Razorpay opens only after you
                choose a plan.
            </p>
            {hint ? (
                <p role="status" className="text-sm text-foreground">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}
