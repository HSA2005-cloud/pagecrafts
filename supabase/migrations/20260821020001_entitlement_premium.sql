-- Premium is per-user (no project), same shape as Pro. One live Premium row per account.

alter table public.entitlements drop constraint if exists entitlements_check;
alter table public.entitlements drop constraint if exists entitlements_kind_project_chk;

alter table public.entitlements add constraint entitlements_kind_project_chk check (
  (kind in ('pro', 'premium') and project_id is null)
  or (kind in ('publish', 'edit_unlock') and project_id is not null)
);

create unique index if not exists entitlements_user_premium_idx
  on public.entitlements (user_id)
  where kind = 'premium';

comment on type public.entitlement_kind is
  'publish and edit_unlock are per-project; pro and premium are per-user account plans.';
