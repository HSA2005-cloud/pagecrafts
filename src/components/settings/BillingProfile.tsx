"use client";

import { useState } from "react";

import type { AccountResponse } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BillingProfile({ initial }: { initial: AccountResponse }) {
    const [displayName, setDisplayName] = useState(initial.displayName);
    const [phone, setPhone] = useState(initial.phone);
    const [billingLine, setBillingLine] = useState(initial.billingLine);
    const [billingCity, setBillingCity] = useState(initial.billingCity);
    const [billingState, setBillingState] = useState(initial.billingState);
    const [billingPostal, setBillingPostal] = useState(initial.billingPostal);
    const [billingCountry, setBillingCountry] = useState(initial.billingCountry);
    const [gstin, setGstin] = useState(initial.gstin);
    const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

    async function save(event: React.FormEvent) {
        event.preventDefault();
        setState("saving");
        try {
            const response = await fetch("/api/v1/account/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    displayName,
                    phone,
                    billingLine,
                    billingCity,
                    billingState,
                    billingPostal,
                    billingCountry,
                    gstin,
                }),
            });
            if (!response.ok) throw new Error("refused");
            setState("saved");
        } catch {
            setState("failed");
        }
    }

    if (!initial.billingReady) {
        return (
            <div className="rounded-2xl glass-panel p-5">
                <p className="text-base font-semibold text-foreground">Billing Details</p>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    Receipt name and address are not stored on this account yet.
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={(event) => void save(event)} className="rounded-2xl glass-panel p-5">
            <p className="text-base font-semibold text-foreground">Billing Details</p>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Name and address for receipts. Card details stay with the payment provider.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                    <span className="text-muted-foreground">Name on the bill</span>
                    <Input
                        className="mt-1.5"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        autoComplete="name"
                    />
                </label>
                <label className="text-sm">
                    <span className="text-muted-foreground">Phone</span>
                    <Input
                        className="mt-1.5"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        autoComplete="tel"
                        inputMode="tel"
                    />
                </label>
                <label className="text-sm sm:col-span-2">
                    <span className="text-muted-foreground">Street or locality</span>
                    <Input
                        className="mt-1.5"
                        value={billingLine}
                        onChange={(e) => setBillingLine(e.target.value)}
                        autoComplete="address-line1"
                    />
                </label>
                <label className="text-sm">
                    <span className="text-muted-foreground">City</span>
                    <Input
                        className="mt-1.5"
                        value={billingCity}
                        onChange={(e) => setBillingCity(e.target.value)}
                        autoComplete="address-level2"
                    />
                </label>
                <label className="text-sm">
                    <span className="text-muted-foreground">State</span>
                    <Input
                        className="mt-1.5"
                        value={billingState}
                        onChange={(e) => setBillingState(e.target.value)}
                        autoComplete="address-level1"
                    />
                </label>
                <label className="text-sm">
                    <span className="text-muted-foreground">PIN / ZIP code</span>
                    <Input
                        className="mt-1.5"
                        value={billingPostal}
                        onChange={(e) => setBillingPostal(e.target.value)}
                        autoComplete="postal-code"
                    />
                </label>
                <label className="text-sm">
                    <span className="text-muted-foreground">Country</span>
                    <Input
                        className="mt-1.5"
                        value={billingCountry}
                        onChange={(e) => setBillingCountry(e.target.value)}
                        autoComplete="country-name"
                    />
                </label>
                <label className="text-sm sm:col-span-2">
                    <span className="text-muted-foreground">GSTIN (optional)</span>
                    <Input
                        className="mt-1.5"
                        value={gstin}
                        onChange={(e) => setGstin(e.target.value.toUpperCase())}
                        autoComplete="off"
                    />
                </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button type="submit" variant="outline-brand" className="rounded-lg font-semibold" disabled={state === "saving"}>
                    {state === "saving" ? "Saving…" : "Save details"}
                </Button>
                <p aria-live="polite" className="text-xs text-muted-foreground">
                    {state === "saved" ? "Saved." : state === "failed" ? "Could not save just now. Try again." : null}
                </p>
            </div>
        </form>
    );
}
