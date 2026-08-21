-- Rollback advanced entitlement kind (run after revoking advanced rows).

drop index if exists public.entitlements_user_advanced_idx;

alter table public.entitlements drop constraint if exists entitlements_kind_project_chk;

alter table public.entitlements add constraint entitlements_kind_project_chk check (
  (kind in ('pro', 'premium') and project_id is null and template_id is null and style_id is null)
  or (kind in ('publish', 'edit_unlock') and project_id is not null and template_id is null and style_id is null)
  or (kind = 'template' and project_id is null and template_id is not null and style_id is null)
  or (kind = 'style' and project_id is null and template_id is null and style_id in ('photos', 'motion'))
);
