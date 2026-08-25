import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Has the shared database actually had the migrations run against it? (R3)
//
//   npm run db:drift
//
// CI proves migrations *can* apply: every run builds a fresh database from the files and
// passes. Nothing proves they *have been* applied to the one everyone shares. That gap has
// bitten three times in three days — replace_project_files missing, then templates.tier —
// and each time it surfaced as a confusing runtime failure rather than as a clear answer.
//
// So this asks the live database, directly, whether each thing the code depends on is
// there. It reads with the anon key and writes nothing. Every probe is one of:
//
//   table   - select one row; a missing relation says so
//   column  - select just that column; a missing column says so
//   rpc     - call with arguments that make the function refuse before it writes
//
// Adding to this list is the point. When a migration adds something the code will rely on,
// add a line here in the same PR, and the next run tells everyone whether the database has
// caught up.

// Not named URL: that shadows the global URL constructor, and the host is printed below.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

// Optional, and worth setting: the grants on most tables are to `authenticated`, so a
// signed-out probe gets "permission denied" and cannot tell a missing column from a table
// it was never allowed to read. Signed in, those become real answers. Same account
// verify:loop uses; this script only ever reads.
const EMAIL = process.env.VERIFY_EMAIL?.trim();
const PASSWORD = process.env.VERIFY_PASSWORD?.trim();

// A project id that cannot exist, so functions taking one refuse before touching anything.
const NOWHERE = "00000000-0000-4000-8000-000000000000";

interface Probe {
  /** What the code would break without, in the words a person would use. */
  what: string;
  /** The migration that introduced it, so a missing one names its own fix. */
  since: string;
  run: (db: SupabaseClient) => Promise<{ message: string } | null>;
}

function table(name: string, since: string): Probe {
  return {
    what: `table ${name}`,
    since,
    run: async (db) => (await db.from(name).select("*").limit(1)).error,
  };
}

function column(name: string, col: string, since: string): Probe {
  return {
    what: `${name}.${col}`,
    since,
    // limit(1) rather than limit(0): PostgREST still resolves the column list either way,
    // and a table that happens to be empty must not read as a missing column.
    run: async (db) => (await db.from(name).select(col).limit(1)).error,
  };
}

function fn(name: string, args: Record<string, unknown>, since: string): Probe {
  return {
    what: `function ${name}()`,
    since,
    run: async (db) => {
      const { error } = await db.rpc(name, args);
      // The function exists and refused, which is the answer we wanted. Only "no such
      // function" counts as drift.
      if (error && !isMissing(error.message)) return null;
      return error;
    },
  };
}

/** Distinguishes "the schema has not caught up" from "RLS said no", which is not drift. */
function isMissing(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

const PROBES: Probe[] = [
  table("users", "20260804120000_initial_schema"),
  table("templates", "20260804120000_initial_schema"),
  table("projects", "20260804120000_initial_schema"),
  table("project_files", "20260804120000_initial_schema"),
  table("commits", "20260804120000_initial_schema"),
  table("deployments", "20260804120000_initial_schema"),
  table("generations", "20260804120000_initial_schema"),
  table("assets", "20260804120000_initial_schema"),
  table("entitlements", "20260805160000_entitlements"),
  table("discount_codes", "20260825140000_discount_codes"),
  table("discount_redemptions", "20260825140000_discount_codes"),
  table("vertical_profiles", "20260812090000_vertical_profiles"),
  table("vertical_profile_aliases", "20260812090000_vertical_profiles"),

  column("commits", "snapshot", "20260808160000_commit_snapshots"),
  column("generations", "provider", "20260809120000_generations_ledger_columns"),
  column("generations", "stage", "20260809120000_generations_ledger_columns"),
  column("generations", "latency_ms", "20260809120000_generations_ledger_columns"),
  column("generations", "prompt_version", "20260809120000_generations_ledger_columns"),
  column("projects", "content_schema", "20260810180000_project_content_schema"),
  column("templates", "tier", "20260811090000_template_tier"),
  column("deployments", "updated_at", "20260811150000_deployment_progress"),

  // Three arguments as of the optimistic-concurrency migration. If the database still has
  // the two-argument version, PostgREST cannot find this signature and reports it as
  // missing — which is exactly the drift worth knowing about.
  fn(
    "replace_project_files",
    { p_project_id: NOWHERE, p_files: {}, p_expected_updated_at: null },
    "20260810120000_files_optimistic_concurrency",
  ),
];

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function migrationsOnDisk(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.slice(0, 14))
    .sort();
}

/**
 * The whole ledger, compared file-by-file. This is the check the probe list below cannot be:
 * probes only find what somebody remembered to add, and every one of the four faults this
 * script exists for was something nobody had added yet.
 *
 * Three answers, not two. "behind" and "unknown" are different facts and the first version
 * of this returned "behind" for both -- so a run without VERIFY_EMAIL said migrations were
 * pending when the ledger was perfectly up to date. Claiming a fault that is not there is
 * the same disease as the generic sentences this script was written to cure.
 */
type Ledger = "ok" | "behind" | "unknown";

async function reportLedger(db: SupabaseClient): Promise<Ledger> {
  const { data, error } = await db.rpc("applied_migration_versions");

  if (error) {
    // The reader is granted to `authenticated` only: the deploy history is not for strangers.
    // Signed out, "permission denied" means exactly that and nothing about drift.
    if (/permission denied/i.test(error.message)) {
      console.log("\n  Migration ledger: not readable signed out.");
      console.log("    Set VERIFY_EMAIL and VERIFY_PASSWORD in .env.local to compare it.");
      return "unknown";
    }

    if (isMissing(error.message)) {
      console.log("\n  Migration ledger: the reader itself is not applied.");
      console.log("    This database predates the check, so it is behind by at least that.");
      console.log("    Fix: npx supabase@latest db push");
      return "behind";
    }

    console.log("\n  Migration ledger: could not read it.");
    console.log(`    ${error.message}`);
    return "unknown";
  }

  const applied = new Set((data as string[] | null) ?? []);
  const onDisk = migrationsOnDisk();
  const pending = onDisk.filter((v) => !applied.has(v));
  const unknown = [...applied].filter((v) => !onDisk.includes(v)).sort();

  if (pending.length === 0 && unknown.length === 0) {
    console.log(`\n  Migration ledger: up to date — all ${onDisk.length} applied.`);
    return "ok";
  }

  if (pending.length > 0) {
    console.log(`\n  Migration ledger: ${pending.length} on disk that this database has never run.`);
    for (const version of pending) {
      const file = readdirSync(MIGRATIONS_DIR).find((f) => f.startsWith(version));
      console.log(`    pending  ${file ?? version}`);
    }
    console.log("\n    Fix: npx supabase@latest db push");
  }

  // A version recorded remotely with no file is the shape that stopped `db push` dead for an
  // hour: a migration renamed in the repo while the database kept the old name.
  if (unknown.length > 0) {
    console.log(`\n  Migration ledger: ${unknown.length} recorded here with no file in the repo.`);
    for (const version of unknown) console.log(`    orphan   ${version}`);
    console.log("\n    Someone renamed or deleted a migration that had already been applied.");
    console.log("    Fix, per orphan: npx supabase@latest migration repair --status reverted <version>");
  }

  return pending.length > 0 ? "behind" : "ok";
}

async function main() {
  if (!SUPABASE_URL || !ANON) {
    console.error("\n  NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set\n");
    process.exitCode = 1;
    return;
  }

  const db = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let as = "signed out";

  if (EMAIL && PASSWORD) {
    const { error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (error) {
      console.error(`\n  could not sign in as ${EMAIL}: ${error.message}`);
      console.error("  carrying on signed out — expect most tables to answer 'permission denied'");
    } else {
      as = `as ${EMAIL}`;
    }
  } else {
    console.error("\n  VERIFY_EMAIL / VERIFY_PASSWORD not set — most tables will answer");
    console.error("  'permission denied' rather than yes or no. Set them for a real answer.");
  }

  const host = new URL(SUPABASE_URL).host;

  const ledger = await reportLedger(db);

  console.log(`\n  Checking ${host} ${as}, against ${PROBES.length} things the code expects.\n`);

  const missing: Probe[] = [];
  const unclear: { probe: Probe; message: string }[] = [];

  for (const probe of PROBES) {
    const error = await probe.run(db);

    if (!error) {
      console.log(`  ok       ${probe.what}`);
      continue;
    }

    if (isMissing(error.message)) {
      missing.push(probe);
      console.log(`  MISSING  ${probe.what}`);
      continue;
    }

    // Permission denied, a paused project, a network blip — real, but not schema drift.
    unclear.push({ probe, message: error.message });
    console.log(`  ?        ${probe.what}  (${error.message})`);
  }

  if (unclear.length > 0) {
    console.log("\n  Could not tell for these — usually RLS or a grant, not drift:");
    for (const { probe, message } of unclear) console.log(`    ${probe.what} — ${message}`);
  }

  if (missing.length === 0) {
    if (ledger === "behind") {
      console.log("\n  Every probe passed, but the ledger above says migrations are pending.");
      console.log("  Trust the ledger: the probes only cover what somebody remembered to add.\n");
      process.exitCode = 1;
      return;
    }

    if (ledger === "unknown") {
      console.log("\n  Probes found no drift, but the ledger could not be read, so this is");
      console.log("  not a clean bill of health. See the note above it.\n");
      return;
    }

    console.log("\n  No drift. The shared database matches what the code expects.\n");
    return;
  }

  const migrations = [...new Set(missing.map((p) => p.since))].sort();

  console.log(`\n  ${missing.length} missing. Apply these migrations, in this order:\n`);
  for (const migration of migrations) console.log(`    supabase/migrations/${migration}.sql`);
  console.log("\n  Until then the code will fail at runtime against this database.\n");

  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`\n  failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
