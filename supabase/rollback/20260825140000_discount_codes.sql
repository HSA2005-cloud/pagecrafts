drop function if exists public.capture_discount_code(text, uuid, text, text, integer, integer);
drop function if exists public.reserve_discount_code(text, uuid);

drop policy if exists discount_redemptions_select_own on public.discount_redemptions;
drop policy if exists discount_codes_no_client on public.discount_codes;

drop table if exists public.discount_redemptions;
drop table if exists public.discount_codes;
