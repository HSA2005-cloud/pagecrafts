-- Custom domains (phase 2 · Stage A connect + Stage B quote prep).
-- A domain outlives any single deployment, so it does not live on deployments.
-- on delete restrict: deleting a project must not silently orphan a paid name.

create table public.domains (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete restrict,
  user_id         uuid not null references public.users (id) on delete cascade,
  name            text not null unique
                  check (char_length(name) between 1 and 253 and name = lower(name)),

  -- 'registered' — we bought it. 'connected' — they already owned it.
  source          text not null check (source in ('registered', 'connected')),

  status          text not null check (status in (
                    'quoted',
                    'paying',
                    'registering',
                    'attaching',
                    'pending_dns',
                    'live',
                    'failed',
                    'expiring',
                    'expired',
                    'transferred_out'
                  )),

  registrar_ref   text,
  price_paid_inr  integer check (price_paid_inr is null or price_paid_inr >= 0),
  registered_at   timestamptz,
  expires_at      timestamptz,
  auto_renew      boolean not null default true,

  -- DNS instructions shown after attach (CNAME / TXT). Opaque to the client of
  -- the hosting provider — the adapter fills these.
  dns_records     jsonb not null default '[]'::jsonb,
  failure_reason  text,

  -- Quote hold for the buy path (15 minutes). Unused for connected domains.
  quoted_price_inr integer check (quoted_price_inr is null or quoted_price_inr >= 0),
  quote_expires_at timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index domains_project_id_idx on public.domains (project_id);
create index domains_user_id_idx on public.domains (user_id);
create index domains_status_idx on public.domains (status);

create trigger domains_set_updated_at
before update on public.domains
for each row execute function public.set_updated_at();

alter table public.domains enable row level security;

create policy domains_select_own on public.domains
  for select to authenticated
  using (user_id = auth.uid());

create policy domains_insert_own on public.domains
  for insert to authenticated
  with check (user_id = auth.uid());

create policy domains_update_own on public.domains
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy domains_delete_own on public.domains
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.domains to authenticated;

comment on table public.domains is
  'Custom hostnames attached to a published site. Connected = bring-your-own; registered = bought through us.';
