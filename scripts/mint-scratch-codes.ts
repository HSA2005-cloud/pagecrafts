import { createClient } from "@supabase/supabase-js";

import {
    generateScratchCode,
    normalizeScratchCode,
    type DiscountAppliesTo,
} from "../src/lib/payments/discount-math";

// Print scratch-card / campaign codes.
//
// One-time physical cards (default):
//   npm run pay:mint-codes -- --count 50 --percent 20 --applies all --batch "fair-2026"
//
// One shared code up to 1 lakh people (each account once):
//   npm run pay:mint-codes -- --count 1 --percent 10 --uses 100000 --applies all --batch "sale-10"
//
// Writes CSV to stdout. Codes are stored in the database; Razorpay is not involved.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const APPLIES: DiscountAppliesTo[] = [
    "all",
    "pro",
    "premium",
    "publish",
    "advanced",
    "generation_pass",
];

function arg(name: string, fallback?: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    if (index === -1) return fallback;
    return process.argv[index + 1] ?? fallback;
}

function fail(message: string): never {
    console.error(`\n  ${message}\n`);
    process.exit(1);
}

async function main(): Promise<void> {
    if (!URL || !SERVICE_ROLE) {
        fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    }

    const uses = Number(arg("uses", "1"));
    const defaultCount = uses > 1 ? "1" : "10";
    const count = Number(arg("count", defaultCount));
    const percent = Number(arg("percent", "20"));
    const applies = (arg("applies", "all") ?? "all") as DiscountAppliesTo;
    const batch = arg("batch", `scratch-${new Date().toISOString().slice(0, 10)}`);
    const expires = arg("expires");
    const chosen = arg("code");

    if (!Number.isInteger(count) || count < 1 || count > 5_000) {
        fail("--count must be a whole number from 1 to 5000.");
    }
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        fail("--percent must be a whole number from 1 to 100.");
    }
    if (!Number.isInteger(uses) || uses < 1 || uses > 100_000) {
        fail("--uses must be a whole number from 1 to 100000 (one lakh people on one code).");
    }
    if (uses > 1 && count !== 1) {
        fail("A shared code (--uses above 1) is minted with --count 1. Print that one code everywhere.");
    }
    if (!APPLIES.includes(applies)) {
        fail(`--applies must be one of: ${APPLIES.join(", ")}`);
    }

    let forced: string | null = null;
    if (chosen) {
        forced = normalizeScratchCode(chosen);
        if (!forced) fail("--code must look like PC-XXXX-XXXX (letters A–Z and digits 2–9).");
        if (count !== 1) fail("--code mints exactly one row; use --count 1.");
    }

    const supabase = createClient(URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const rows: { code: string; percent: number; applies: string; batch: string; uses: number }[] =
        [];

    while (rows.length < count) {
        const code = forced ?? generateScratchCode();
        const { error } = await supabase.from("discount_codes").insert({
            code,
            batch_label: batch,
            percent_off: percent,
            applies_to: applies,
            max_redemptions: uses,
            expires_at: expires ? new Date(expires).toISOString() : null,
        });

        if (error?.code === "23505") {
            if (forced) fail(`${code} is already in the database.`);
            continue;
        }
        if (error) fail(`Could not insert ${code}: ${error.message}`);
        rows.push({ code, percent, applies, batch: batch!, uses });
        if (forced) break;
    }

    console.log("code,percent_off,applies_to,uses,batch");
    for (const row of rows) {
        console.log(`${row.code},${row.percent},${row.applies},${row.uses},${row.batch}`);
    }

    console.error(
        uses > 1
            ? `\n  minted shared code ${rows[0]?.code} — ${percent}% off, up to ${uses} people (once each)\n`
            : `\n  minted ${rows.length} one-time ${percent}% ${applies} codes in batch ${batch}\n`,
    );
}

main().catch((error: unknown) => {
    fail(error instanceof Error ? error.message : String(error));
});
