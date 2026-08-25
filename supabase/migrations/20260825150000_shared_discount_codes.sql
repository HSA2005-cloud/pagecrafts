-- Shared campaign codes: many people can use one code (up to max_redemptions).
-- A one-time physical card still holds exclusively. A shared code does not: the
-- previous reserved_by column blocked everyone else while one checkout was open.
-- Each account may redeem a given code once.

create unique index if not exists discount_redemptions_code_user_idx
  on public.discount_redemptions (code_id, user_id);

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

  if exists (
    select 1
      from public.discount_redemptions
     where code_id = row.id
       and user_id = p_user_id
  ) then
    return;
  end if;

  -- One-time cards: one unpaid checkout at a time. Shared codes skip this lock.
  if row.max_redemptions = 1 then
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
  end if;

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

  if exists (
    select 1
      from public.discount_redemptions
     where code_id = row.id
       and user_id = p_user_id
  ) then
    return false;
  end if;

  update public.discount_codes
     set redeemed_count = redeemed_count + 1,
         reserved_by = null,
         reserved_at = null,
         reserved_order_id = null
   where id = row.id
     and redeemed_count < max_redemptions;

  if not found then
    return false;
  end if;

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
