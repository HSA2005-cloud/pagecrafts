"use client";

import {
    BRIEF_LIMITS,
    type SiteBrief,
} from "@/lib/ai/generate/brief";
import { DictationButton } from "@/components/ui/DictationButton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function BriefFields({
    value,
    onChange,
    disabled,
}: {
    value: SiteBrief;
    onChange: (next: SiteBrief) => void;
    disabled?: boolean;
}) {
    const set = (patch: Partial<SiteBrief>) => onChange({ ...value, ...patch });

    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
                Name the business, its profession or trade, where it is, and what it
                offers. Type it, or tap the mic — AI cannot invent a phone number you
                never gave.
            </p>

            <Field label="Business name" htmlFor="brief-name">
                <Input
                    id="brief-name"
                    maxLength={BRIEF_LIMITS.name}
                    inputSize="lg"
                    autoComplete="organization"
                    placeholder="Brain Surgery · Mithas Sweets"
                    value={value.name}
                    disabled={disabled}
                    onChange={(e) => set({ name: e.target.value })}
                />
            </Field>

            <Field
                label="Profession or trade"
                htmlFor="brief-profession"
                hint="The field of work — medical, bakery, plumbing. Photos are based on this."
            >
                <Input
                    id="brief-profession"
                    maxLength={BRIEF_LIMITS.profession}
                    inputSize="lg"
                    placeholder="Medical, sweet shop, plumber…"
                    value={value.profession}
                    disabled={disabled}
                    onChange={(e) => set({ profession: e.target.value })}
                />
            </Field>

            <Field label="City or area" htmlFor="brief-place">
                <Input
                    id="brief-place"
                    maxLength={BRIEF_LIMITS.place}
                    inputSize="lg"
                    placeholder="Old Delhi, Koramangala…"
                    value={value.place}
                    disabled={disabled}
                    onChange={(e) => set({ place: e.target.value })}
                />
            </Field>

            <Field
                label="What do they offer?"
                htmlFor="brief-offer"
                hint="Services and details — check-ups, cakes, emergency callouts. The profession field above is what photos follow."
            >
                <div className="relative">
                    <textarea
                        id="brief-offer"
                        rows={3}
                        maxLength={BRIEF_LIMITS.offer}
                        value={value.offer}
                        disabled={disabled}
                        aria-describedby="brief-offer-count"
                        placeholder="Family dental clinic. Check-ups, root canals and braces."
                        className="flex min-h-20 w-full resize-y rounded-lg border border-input bg-field px-4 py-3 pr-12 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        onChange={(e) => set({ offer: e.target.value })}
                    />
                    <DictationButton
                        disabled={disabled}
                        label="Speak what they do"
                        className="absolute right-2 top-2 size-8 rounded-md"
                        onTranscript={(spoken) =>
                            set({ offer: joinSpoken(value.offer, spoken) })
                        }
                    />
                </div>
                {/* Silent until it matters, loud once it does: a counter on every field from
                    the first keystroke is noise, but a paste that lands on the cap with no
                    warning is how somebody loses a long brief. */}
                <p
                    id="brief-offer-count"
                    aria-live="polite"
                    className={cn(
                        'mt-1 text-xs',
                        value.offer.length >= BRIEF_LIMITS.offer
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                    )}
                >
                    {value.offer.length >= BRIEF_LIMITS.offer
                        ? `That is the limit — ${BRIEF_LIMITS.offer} characters. Anything longer was not kept.`
                        : value.offer.length > BRIEF_LIMITS.offer * 0.75
                          ? `${value.offer.length} of ${BRIEF_LIMITS.offer} characters.`
                          : null}
                </p>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Phone" htmlFor="brief-phone" optional>
                    <Input
                        id="brief-phone"
                        maxLength={BRIEF_LIMITS.phone}
                        inputSize="lg"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="Only if you want it on the site"
                        value={value.phone}
                        disabled={disabled}
                        onChange={(e) => set({ phone: e.target.value })}
                    />
                </Field>
                <Field label="Hours" htmlFor="brief-hours" optional>
                    <Input
                        id="brief-hours"
                        maxLength={BRIEF_LIMITS.hours}
                        inputSize="lg"
                        placeholder="Open daily 10–8, Sundays too"
                        value={value.hours}
                        disabled={disabled}
                        onChange={(e) => set({ hours: e.target.value })}
                    />
                </Field>
            </div>

            <Field label="Anything else?" htmlFor="brief-extra" optional>
                <div className="relative">
                    <textarea
                        id="brief-extra"
                        maxLength={BRIEF_LIMITS.extra}
                        rows={2}
                        value={value.extra}
                        disabled={disabled}
                        placeholder="WhatsApp orders, parking, a Hindi name on the page…"
                        className="flex min-h-16 w-full resize-y rounded-lg border border-input bg-field px-4 py-3 pr-12 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        onChange={(e) => set({ extra: e.target.value })}
                    />
                    <DictationButton
                        disabled={disabled}
                        label="Speak anything else"
                        className="absolute right-2 top-2 size-8 rounded-md"
                        onTranscript={(spoken) =>
                            set({ extra: joinSpoken(value.extra, spoken) })
                        }
                    />
                </div>
            </Field>
        </div>
    );
}

function Field({
    label,
    htmlFor,
    hint,
    optional,
    children,
}: {
    label: string;
    htmlFor: string;
    hint?: string;
    optional?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
                {label}
                {optional ? (
                    <span className="font-normal text-muted-foreground"> (optional)</span>
                ) : null}
            </label>
            {children}
            {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

function joinSpoken(current: string, spoken: string): string {
    const next = spoken.trim();
    if (!next) return current;
    if (!current.trim()) return next;
    return `${current.trim()} ${next}`;
}
