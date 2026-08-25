"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type PreviewKind = "pro" | "premium" | "advanced" | "generation_pass";

interface Preview {
    priceInr: number;
    listPriceInr: number;
    discountPercent?: number;
}

export function DiscountCodeField({
    kind,
    value,
    onChange,
    className,
}: {
    kind: PreviewKind;
    value: string;
    onChange: (value: string) => void;
    className?: string;
}) {
    const [hint, setHint] = useState<string | null>(null);

    async function check() {
        const code = value.trim();
        if (!code) {
            setHint(null);
            return;
        }

        const { data, error } = await apiPost<Preview>("/api/v1/payments/discount/preview", {
            code,
            kind,
        });

        if (error || !data) {
            setHint(error ?? "That code could not be checked.");
            return;
        }

        if (data.discountPercent && data.priceInr < data.listPriceInr) {
            setHint(
                data.priceInr === 0
                    ? `This card is ${data.discountPercent}% off — this purchase will be free.`
                    : `This card is ${data.discountPercent}% off — pay Rs ${data.priceInr} instead of Rs ${data.listPriceInr}.`,
            );
            return;
        }

        setHint(null);
    }

    return (
        <div className={cn("space-y-2", className)}>
            <label htmlFor="scratch-card-code" className="text-sm font-medium text-foreground">
                Scratch-card code
            </label>
            <Input
                id="scratch-card-code"
                name="discountCode"
                autoComplete="off"
                spellCheck={false}
                placeholder="PC-XXXX-XXXX"
                value={value}
                onChange={(event) => {
                    onChange(event.target.value);
                    setHint(null);
                }}
                onBlur={() => void check()}
                className="font-mono uppercase"
            />
            <p className="text-xs leading-5 text-muted-foreground">
                Optional. If you have a physical scratch card, type the code here before you pay.
            </p>
            {hint ? (
                <p role="status" className="text-sm text-foreground">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}
