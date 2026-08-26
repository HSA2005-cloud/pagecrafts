-- What Supabase puts in the database before the first of our migrations runs.
--
-- Every migration in supabase/migrations references objects nobody in this repository
-- created: auth.users, auth.uid(), storage.objects, storage.foldername(), and the roles
-- `authenticated` and `service_role`. On a hosted project those exist because the platform
-- created them. Nothing here is our schema; it is the ground our schema is built on, and it
-- is written out so the migrations can be run somewhere that is not a Supabase project.
--
-- The definitions are the platform's own, kept deliberately faithful rather than convenient
-- — the point of running the migrations is to find out what real Postgres says about them,
-- and a prelude that smooths off a corner is a prelude that hides a failure. Where this is
-- narrower than the real thing it is narrower by omission (columns and features our
-- migrations never touch), never by relaxation.

-- ── Roles ────────────────────────────────────────────────────────────────────────────
-- PostgREST connects as `authenticator` and assumes one of these per request. `anon` and
-- `authenticated` are ordinary roles with no bypass; `service_role` has BYPASSRLS, which is
-- exactly why the server-side admin client can do what a signed-in user cannot.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin noinherit bypassrls;
    end if;
end
$$;

-- ── auth ─────────────────────────────────────────────────────────────────────────────
create schema if not exists auth;

-- GoTrue's users table.
--
-- The first three columns are the ones this repository actually depends on: the primary key
-- public.users hangs off, and the two the profile trigger reads. The rest are here because
-- supabase/seed.sql writes them, and a prelude that omitted them would make the seed fail
-- for a reason that has nothing to do with the seed. Column types follow GoTrue's own —
-- varchar(255) where GoTrue uses varchar(255) — so a seed value too long for the real table
-- is too long for this one.
create table if not exists auth.users (
    instance_id uuid,
    id uuid primary key default gen_random_uuid(),
    aud varchar(255),
    role varchar(255),
    email varchar(255),
    encrypted_password varchar(255),
    email_confirmed_at timestamptz,
    invited_at timestamptz,
    confirmation_token varchar(255),
    confirmation_sent_at timestamptz,
    recovery_token varchar(255),
    recovery_sent_at timestamptz,
    email_change_token_new varchar(255),
    email_change varchar(255),
    email_change_sent_at timestamptz,
    last_sign_in_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    phone text unique default null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- auth.uid() is the whole of RLS. It reads the request's JWT claims out of a GUC that
-- PostgREST sets per request, which is why a policy written against it is per-caller and
-- why a test can impersonate somebody by setting the same GUC.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')::text;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- ── storage ──────────────────────────────────────────────────────────────────────────
create schema if not exists storage;

create table if not exists storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz not null default now()
);

create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null,
    owner uuid,
    metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (bucket_id, name)
);

-- Storage's own RLS. Our migration adds policies to this table, which only bite because
-- the platform enabled row security on it — if this line were missing the policies would
-- be created and silently never applied, and the migration would still "pass".
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

-- Splits an object key into path segments. The asset policies index [1] of this to get the
-- owning user's id out of the key, so its exact behaviour is load-bearing: it is what makes
-- `<uid>/file.png` private to that uid.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
    _parts text[];
begin
    select string_to_array(name, '/') into _parts;
    return _parts[1 : array_length(_parts, 1) - 1];
end
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

-- ── supabase_migrations ────────────────────────────────────────────────────────────────
-- The CLI keeps applied versions here. Our migrations (and db:drift) read it through
-- public.applied_migration_versions(), so CI must create the ledger too.
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
    version text primary key
);
