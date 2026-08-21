delete from public.entitlements where kind in ('template', 'style');

drop index if exists public.entitlements_user_template_idx;
drop index if exists public.entitlements_user_style_idx;

alter table public.entitlements drop constraint if exists entitlements_kind_project_chk;

alter table public.entitlements add constraint entitlements_kind_project_chk check (
  (kind in ('pro', 'premium') and project_id is null)
  or (kind in ('publish', 'edit_unlock') and project_id is not null)
);

alter table public.entitlements drop column if exists template_id;
alter table public.entitlements drop column if exists style_id;
