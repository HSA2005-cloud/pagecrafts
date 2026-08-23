-- Subscription plans: Starter (default / no row), Pro, Premium.
--
-- The product had a single `pro` subscription entitlement. This adds a second,
-- higher tier `premium`, so the three template tiers map onto three plans:
--   free      design -> any plan (incl. Starter)
--   premium   design -> Pro or Premium
--   signature design -> Premium only
--
-- A subscription is a user-level entitlement (no project). The old CHECK only
-- allowed `pro` at the user level; it is rewritten so that any non-per-project
-- kind is user-level and only publish/edit_unlock are per-project. Phrasing it
-- without naming the new enum literal keeps it safe to run in the same
-- transaction that adds the value.

alter type public.entitlement_kind add value if not exists 'premium';
alter type public.entitlement_source add value if not exists 'premium';

alter table public.entitlements drop constraint if exists entitlements_check;
alter table public.entitlements add constraint entitlements_check check (
  (kind in ('publish', 'edit_unlock') and project_id is not null)
  or (kind not in ('publish', 'edit_unlock') and project_id is null)
);

-- Payments: audit trail + idempotency for Razorpay-verified plan upgrades.
-- Written only by the server (service role) after a signature is verified; a
-- client may read its own rows. The unique order id is what makes a replayed
-- verify call or a duplicate webhook a no-op rather than a second grant.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan text not null check (plan in ('pro', 'premium')),
  razorpay_order_id text not null unique,
  razorpay_payment_id text,
  amount_inr integer not null,
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy payments_select_own on public.payments
  for select to authenticated
  using (user_id = auth.uid());

create index if not exists payments_user_idx on public.payments (user_id);
