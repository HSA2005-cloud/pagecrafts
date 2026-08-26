-- PostgREST only reliably exposes SETOF returns. Databases that already applied
-- the composite-returning reserve_discount_code need this replace so checkout
-- can call the RPC (the app also holds a card via a table update if the cache
-- is still stale).

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

revoke execute on function public.reserve_discount_code(text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_discount_code(text, uuid) to service_role;

notify pgrst, 'reload schema';
