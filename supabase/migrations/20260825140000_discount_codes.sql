-- Scratch-card discount codes (physical cards: swipe/scratch, enter at checkout).
--
-- Codes live here, not in the Razorpay dashboard. Checkout creates the Razorpay order at
-- the discounted amount; a 100% code grants without opening Razorpay. Clients never read
-- unused codes — minting is a service-role script.

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  batch_label text not null,
  percent_off integer not null,
  applies_to text not null,
  max_redemptions integer not null default 1,
  redeemed_count integer not null default 0,
  reserved_by uuid references public.users(id) on delete set null,
  reserved_order_id text,
  reserved_at timestamptz,
  expires_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint discount_codes_code_format check (code ~ '^PC-[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  constraint discount_codes_percent check (percent_off between 1 and 100),
  constraint discount_codes_applies check (
    applies_to in ('all', 'pro', 'premium', 'publish', 'advanced', 'generation_pass')
  ),
  constraint discount_codes_max_redemptions check (max_redemptions >= 1),
  constraint discount_codes_redeemed_count check (
    redeemed_count >= 0 and redeemed_count <= max_redemptions
  )
);

create unique index if not exists discount_codes_code_idx on public.discount_codes (code);

create table if not exists public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.discount_codes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  order_id text,
  checkout_kind text not null,
  list_price_inr integer not null,
  paid_inr integer not null,
  captured_at timestamptz not null default now()
);

create unique index if not exists discount_redemptions_order_id_idx
  on public.discount_redemptions (order_id)
  where order_id is not null;

create index if not exists discount_redemptions_code_id_idx on public.discount_redemptions (code_id);
create index if not exists discount_redemptions_user_id_idx on public.discount_redemptions (user_id);

alter table public.discount_codes enable row level security;
alter table public.discount_redemptions enable row level security;

-- Deny-all for signed-in clients: unused codes must not leak. Service role bypasses RLS.
create policy discount_codes_no_client on public.discount_codes
  for all to authenticated
  using (false)
  with check (false);

create policy discount_redemptions_select_own on public.discount_redemptions
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.discount_codes from public, anon, authenticated;
revoke all on public.discount_redemptions from public, anon, authenticated;

grant all on public.discount_codes to service_role;
grant all on public.discount_redemptions to service_role;

-- Select is granted so a missing table is distinguishable from RLS. The deny-all
-- policy still returns no unused codes. Redemptions are only the caller's own rows.
grant select on public.discount_codes to authenticated;
grant select on public.discount_redemptions to authenticated;

comment on table public.discount_codes is
  'One-time (or limited) scratch-card codes. Written by minting; reserved and captured by checkout.';
comment on table public.discount_redemptions is
  'Successful uses of a scratch-card code. Clients may read their own rows only.';

-- Atomic hold: one unpaid checkout at a time. Stale holds (30 minutes) can be taken over.
-- SETOF so PostgREST exposes the function in the schema cache (a bare composite often 404s).
drop function if exists public.reserve_discount_code(text, uuid);
create function public.reserve_discount_code(p_code text, p_user_id uuid)
returns setof public.discount_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.discount_codes;
begin
  select * into row
    from public.discount_codes
   where code = p_code
   for update;

  if not found then
    return;
  end if;

  if row.disabled_at is not null then
    return;
  end if;

  if row.expires_at is not null and row.expires_at <= now() then
    return;
  end if;

  if row.redeemed_count >= row.max_redemptions then
    return;
  end if;

  if row.reserved_by is not null
     and row.reserved_at is not null
     and row.reserved_at > now() - interval '30 minutes'
     and row.reserved_by <> p_user_id then
    return;
  end if;

  update public.discount_codes
     set reserved_by = p_user_id,
         reserved_at = now(),
         reserved_order_id = null
   where id = row.id
   returning * into row;

  return next row;
end;
$$;

create or replace function public.capture_discount_code(
  p_code text,
  p_user_id uuid,
  p_order_id text,
  p_kind text,
  p_list_price_inr integer,
  p_paid_inr integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.discount_codes;
begin
  select * into row
    from public.discount_codes
   where code = p_code
   for update;

  if not found then
    return false;
  end if;

  if row.redeemed_count >= row.max_redemptions then
    return false;
  end if;

  update public.discount_codes
     set redeemed_count = redeemed_count + 1,
         reserved_by = null,
         reserved_at = null,
         reserved_order_id = null
   where id = row.id;

  insert into public.discount_redemptions (
    code_id, user_id, order_id, checkout_kind, list_price_inr, paid_inr
  ) values (
    row.id, p_user_id, p_order_id, p_kind, p_list_price_inr, p_paid_inr
  )
  on conflict do nothing;

  return true;
end;
$$;

revoke execute on function public.reserve_discount_code(text, uuid) from public, anon, authenticated;
revoke execute on function public.capture_discount_code(text, uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_discount_code(text, uuid) to service_role;
grant execute on function public.capture_discount_code(text, uuid, text, text, integer, integer) to service_role;

notify pgrst, 'reload schema';
