delete from public.entitlements where kind = 'premium';

drop index if exists public.entitlements_user_premium_idx;

alter table public.entitlements drop constraint if exists entitlements_check;
alter table public.entitlements drop constraint if exists entitlements_kind_project_chk;

alter table public.entitlements add constraint entitlements_check check (
  (kind = 'pro' and project_id is null)
  or (kind in ('publish', 'edit_unlock') and project_id is not null)
);
