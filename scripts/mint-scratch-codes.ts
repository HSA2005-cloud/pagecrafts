import { createClient } from "@supabase/supabase-js";

import { generateScratchCode, type DiscountAppliesTo } from "../src/lib/payments/discount-math";

// Print unique scratch-card codes for physical cards.
//
//   npm run pay:mint-codes -- --count 50 --percent 20 --applies all --batch "fair-2026"
//
// Writes CSV to stdout. Codes are stored in the database; Razorpay is not involved.
// Checkout creates the Razorpay order at the discounted amount.

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

    const count = Number(arg("count", "10"));
    const percent = Number(arg("percent", "20"));
    const applies = (arg("applies", "all") ?? "all") as DiscountAppliesTo;
    const batch = arg("batch", `scratch-${new Date().toISOString().slice(0, 10)}`);
    const expires = arg("expires");

    if (!Number.isInteger(count) || count < 1 || count > 5_000) {
        fail("--count must be a whole number from 1 to 5000.");
    }
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        fail("--percent must be a whole number from 1 to 100.");
    }
    if (!APPLIES.includes(applies)) {
        fail(`--applies must be one of: ${APPLIES.join(", ")}`);
    }

    const supabase = createClient(URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const rows: { code: string; percent: number; applies: string; batch: string }[] = [];

    while (rows.length < count) {
        const code = generateScratchCode();
        const { error } = await supabase.from("discount_codes").insert({
            code,
            batch_label: batch,
            percent_off: percent,
            applies_to: applies,
            max_redemptions: 1,
            expires_at: expires ? new Date(expires).toISOString() : null,
        });

        if (error?.code === "23505") continue;
        if (error) fail(`Could not insert ${code}: ${error.message}`);
        rows.push({ code, percent, applies, batch: batch! });
    }

    console.log("code,percent_off,applies_to,batch");
    for (const row of rows) {
        console.log(`${row.code},${row.percent},${row.applies},${row.batch}`);
    }

    console.error(`\n  minted ${rows.length} ${percent}% ${applies} codes in batch ${batch}\n`);
}

main().catch((error: unknown) => {
    fail(error instanceof Error ? error.message : String(error));
});
