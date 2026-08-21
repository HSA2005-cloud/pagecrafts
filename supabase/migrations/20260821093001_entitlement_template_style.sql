-- A paid design or look is bought once per account, not as a plan.
-- template_id is a catalogue row; style_id is photos | motion.

alter table public.entitlements
  add column if not exists template_id uuid references public.templates(id) on delete cascade,
  add column if not exists style_id text;

alter table public.entitlements drop constraint if exists entitlements_kind_project_chk;

alter table public.entitlements add constraint entitlements_kind_project_chk check (
  (kind in ('pro', 'premium') and project_id is null and template_id is null and style_id is null)
  or (kind in ('publish', 'edit_unlock') and project_id is not null and template_id is null and style_id is null)
  or (kind = 'template' and project_id is null and template_id is not null and style_id is null)
  or (kind = 'style' and project_id is null and template_id is null and style_id in ('photos', 'motion'))
);

create unique index if not exists entitlements_user_template_idx
  on public.entitlements (user_id, template_id)
  where kind = 'template';

create unique index if not exists entitlements_user_style_idx
  on public.entitlements (user_id, style_id)
  where kind = 'style';

comment on type public.entitlement_kind is
  'publish and edit_unlock are per-project; template and style are per-user item unlocks; pro and premium are legacy account plans.';
