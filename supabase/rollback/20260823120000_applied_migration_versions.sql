-- Rollback the migration-ledger reader. Nothing depends on it at runtime; db:drift falls
-- back to reporting that the check itself is not applied.

drop function if exists public.applied_migration_versions();
