-- Allow user-scoped `advanced` rows (no project / template / style).

alter table public.entitlements drop constraint if exists entitlements_kind_project_chk;

alter table public.entitlements add constraint entitlements_kind_project_chk check (
  (kind in ('pro', 'premium', 'advanced') and project_id is null and template_id is null and style_id is null)
  or (kind in ('publish', 'edit_unlock') and project_id is not null and template_id is null and style_id is null)
  or (kind = 'template' and project_id is null and template_id is not null and style_id is null)
  or (kind = 'style' and project_id is null and template_id is null and style_id in ('photos', 'motion'))
);

create unique index if not exists entitlements_user_advanced_idx
  on public.entitlements (user_id)
  where kind = 'advanced';

comment on type public.entitlement_kind is
  'publish/edit_unlock per-project; template/style per-user design unlocks; advanced is the AI usage package; pro/premium are legacy plan rows.';
