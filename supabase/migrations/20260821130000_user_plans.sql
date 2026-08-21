-- User plans: a persistent account plan and a record of what was paid for it.
--
-- The plan is the single source of truth for what a person may do — which template tiers
-- they may fork, whether publish is included, whether AI generations are uncapped. It lives
-- on the user row so a fresh login on any device reads the same answer, and it is written
-- only by the server (service role): `plan` is deliberately left out of the column-level
-- update grant to `authenticated`, so a signed-in client can read its own plan but can never
-- set it. The whole point of a paywall is that the client cannot describe its own side of it.
--
-- These are one-time purchases, not subscriptions (Rs 499 Pro, Rs 999 Premium). A purchase
-- upgrades the plan and never expires; plan_purchases keeps the receipt.

create type public.user_plan as enum ('starter', 'pro', 'premium');

alter table public.users
  add column if not exists plan public.user_plan not null default 'starter';

comment on column public.users.plan is
  'Account plan: starter (default), pro, or premium. Written by the server/service role only; '
  'a trigger refuses a change from any client role, so a signed-in user cannot self-upgrade.';

-- The plan must not be self-servable. Column-level grants are the first line, but a local
-- stack (and any environment with a broad baseline grant) can leave `authenticated` holding
-- table-wide UPDATE — RLS would then let a user set their own plan. This trigger closes that
-- for good: a change to `plan` is refused unless the writer is the server (service_role) or a
-- migration (postgres). It is not SECURITY DEFINER on purpose, so `current_user` is the role
-- the statement actually runs as — 'authenticated'/'anon' for a client, 'service_role' for the
-- admin client PageCraft uses to grant a plan after a verified payment.
create or replace function public.enforce_plan_write_role()
returns trigger
language plpgsql
as $$
begin
  if new.plan is distinct from old.plan
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'The plan can only be changed by the server.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger users_enforce_plan_write
before update on public.users
for each row execute function public.enforce_plan_write_role();

-- The purchase ledger. One row per Razorpay order, so a duplicated webhook or a retried
-- verify lands on the same row rather than granting twice. razorpay_order_id is unique for
-- that reason; razorpay_payment_id is unique so the same captured payment cannot be replayed
-- against two orders.
create table public.plan_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- Only paid plans are ever purchased; starter is the default nobody buys.
  plan public.user_plan not null check (plan in ('pro', 'premium')),
  amount_inr integer not null check (amount_inr >= 0),
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  -- True only once the server has verified the Razorpay signature for this order.
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_purchases_user_id_idx on public.plan_purchases (user_id);

create trigger plan_purchases_set_updated_at
before update on public.plan_purchases
for each row execute function public.set_updated_at();

-- RLS auto-enables via the event trigger; enable explicitly too for clarity.
alter table public.plan_purchases enable row level security;

-- Clients may read their own purchase history (receipts, current plan reasoning); they may
-- never write it. Grants are made by the server with the service role.
grant select on public.plan_purchases to authenticated;

create policy plan_purchases_select_own on public.plan_purchases
  for select to authenticated using (user_id = auth.uid());
