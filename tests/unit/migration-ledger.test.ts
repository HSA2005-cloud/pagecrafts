import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Four faults in one day came from the shared database trailing the code, and each one
// reached a person as a generic sentence because nothing could see the migration ledger.
// PostgREST only exposes `public`, so supabase_migrations.schema_migrations was invisible
// to everything except the CLI.
//
// This covers the two properties that make the reader safe to ship: it is not a way for a
// stranger to read the deploy history, and it cannot be tricked into reading another schema.

const MIGRATION = join(
    process.cwd(),
    'supabase/migrations/20260823120000_applied_migration_versions.sql',
);
const SQL = readFileSync(MIGRATION, 'utf8');
const SCRIPT = readFileSync(join(process.cwd(), 'scripts/db-drift.ts'), 'utf8');

describe('the migration ledger reader', () => {
    it('runs as definer, because the ledger belongs to the CLI role', () => {
        expect(SQL).toMatch(/security\s+definer/i);
    });

    // A definer function without a pinned search_path is the classic privilege-escalation
    // shape: whoever calls it chooses which schema `schema_migrations` resolves to.
    it('pins its search_path, so the caller cannot choose the table', () => {
        expect(SQL).toMatch(/set\s+search_path\s*=\s*supabase_migrations,\s*pg_temp/i);
    });

    it('is not callable by a signed-out visitor', () => {
        expect(SQL).toMatch(/revoke\s+execute[\s\S]*from\s+public,\s*anon/i);
        expect(SQL).toMatch(/grant\s+execute[\s\S]*to\s+authenticated/i);
    });

    it('returns versions and nothing else', () => {
        expect(SQL).toMatch(/select\s+version\s+from\s+schema_migrations/i);
        expect(SQL).not.toMatch(/select\s+\*/i);
    });

    // A plain sql function validates its body when it is created, and `supabase db reset`
    // builds a bare Postgres from these files where that ledger does not exist -- so the
    // first version of this took the whole migration stack down with it. Dynamic SQL is not
    // checked at creation, and the handler answers honestly for a database with no ledger.
    it('survives a database that has no ledger at all', () => {
        expect(SQL).toMatch(/language\s+plpgsql/i);
        expect(SQL).toMatch(/return query execute/i);
        expect(SQL).toMatch(/when undefined_table or invalid_schema_name then/i);
    });

    it('has a rollback beside it, like every other migration', () => {
        const rollbacks = readdirSync(join(process.cwd(), 'supabase/rollback'));

        expect(rollbacks).toContain('20260823120000_applied_migration_versions.sql');
    });
});

describe('db:drift reads the ledger, not just its own probe list', () => {
    // The probe list only ever finds what somebody remembered to add to it. Every fault it
    // was written for was something nobody had added yet, which is why the file comparison
    // matters more than the probes do.
    it('compares the migrations directory against what the database reports', () => {
        expect(SCRIPT).toContain('applied_migration_versions');
        expect(SCRIPT).toContain('supabase/migrations');
    });

    it('names the fix for a pending migration', () => {
        expect(SCRIPT).toContain('npx supabase@latest db push');
    });

    // A version recorded remotely with no file locally is what stopped `db push` dead for an
    // hour: a migration renamed in the repo while the database kept the old name.
    it('names the fix for a version the repo no longer has', () => {
        expect(SCRIPT).toContain('migration repair --status reverted');
    });

    it('fails the run when the ledger is behind, even if every probe passed', () => {
        expect(SCRIPT).toContain('Trust the ledger');
    });

    // The first version of this returned "behind" for any error, so a run without
    // VERIFY_EMAIL reported migrations pending against a database that was up to date.
    // Claiming a fault that is not there is the same disease this script exists to cure.
    it('tells "cannot read the ledger" apart from "the ledger is behind"', () => {
        expect(SCRIPT).toMatch(/type Ledger = "ok" \| "behind" \| "unknown"/);
        expect(SCRIPT).toMatch(/permission denied/i);
        expect(SCRIPT).toContain('not readable signed out');
    });

    it('does not call an unreadable ledger a clean bill of health either', () => {
        expect(SCRIPT).toContain('not a clean bill of health');
    });
});
