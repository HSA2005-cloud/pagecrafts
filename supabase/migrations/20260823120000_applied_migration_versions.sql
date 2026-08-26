-- Let the app ask which migrations this database has actually had run against it.
--
-- supabase_migrations.schema_migrations is the ledger the CLI keeps, but PostgREST only
-- exposes `public`, so nothing outside the CLI can read it. That is why a database eleven
-- migrations behind looked, from the app, exactly like a database that was up to date --
-- four separate faults in one day, each surfacing as a generic sentence with the real cause
-- invisible until somebody went digging in SQL.
--
-- plpgsql with dynamic SQL, not a plain sql function, because a plain one validates its
-- body at creation time: `supabase db reset` builds a bare Postgres from these files and
-- that ledger does not exist there, so the whole stack failed to apply. The handler returns
-- nothing in that case, which is the honest answer for a database that keeps no ledger.
--
-- security definer because the ledger belongs to the CLI's role. It returns version strings
-- and nothing else: no schema, no data, no clue about anyone's account. Execute is granted
-- to authenticated only, so a signed-out visitor cannot enumerate the deploy history.

create or replace function public.applied_migration_versions()
returns setof text
language plpgsql
security definer
set search_path = supabase_migrations, pg_temp
stable
as $$
begin
  return query execute 'select version from schema_migrations order by version';
exception
  when undefined_table or invalid_schema_name then
    return;
end;
$$;

revoke execute on function public.applied_migration_versions() from public, anon;
grant execute on function public.applied_migration_versions() to authenticated, service_role;

comment on function public.applied_migration_versions() is
  'Version strings from the migration ledger, so db:drift can tell a behind database from a broken one. Empty where no ledger exists. Reads nothing else.';
