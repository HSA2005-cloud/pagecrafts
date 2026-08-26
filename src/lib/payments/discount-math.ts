import { randomInt } from "node:crypto";

import type { OrderKind } from "./razorpay";

// Scratch-card codes. Printed as PC-XXXX-XXXX using an alphabet that skips 0/O/1/I/L
// so a person reading a physical card is less likely to type the wrong character.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const CODE_PATTERN = /^PC-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export type DiscountAppliesTo =
    | "all"
    | "pro"
    | "premium"
    | "publish"
    | "advanced"
    | "generation_pass";

export function generateScratchCode(): string {
    let body = "";
    for (let i = 0; i < 8; i += 1) {
        body += ALPHABET[randomInt(ALPHABET.length)]!;
    }
    return `PC-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** Uppercase, strip spaces/dashes, then re-insert the printed shape when possible. */
export function normalizeScratchCode(raw: string): string | null {
    const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (compact.length !== 10 || !compact.startsWith("PC")) return null;
    const formatted = `PC-${compact.slice(2, 6)}-${compact.slice(6, 10)}`;
    if (!CODE_PATTERN.test(formatted)) return null;
    return formatted;
}

export function applyPercentOff(listPriceInr: number, percentOff: number): number {
    if (percentOff >= 100) return 0;
    if (percentOff <= 0) return listPriceInr;
    return Math.max(0, Math.round((listPriceInr * (100 - percentOff)) / 100));
}

/** PostgREST returns SETOF as an array and a composite as an object. */
export function unwrapDiscountRpcRow<T extends object>(data: unknown): T | null {
    if (data == null) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return null;
    if (!("code" in row) || !("percent_off" in row)) return null;
    return row as T;
}

export function codeAppliesTo(appliesTo: DiscountAppliesTo, kind: OrderKind): boolean {
    if (appliesTo === "all") return true;
    if (appliesTo === kind) return true;
    // Catalogue unlocks are plan upgrades now; a Pro card covers that checkout too.
    if (appliesTo === "pro" && kind === "template") return true;
    if (appliesTo === "premium" && kind === "style") return true;
    return false;
}
