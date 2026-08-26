revoke update (
  billing_state,
  billing_postal,
  billing_country
) on public.users from authenticated;

grant update (
  handle,
  avatar_url,
  training_opt_in,
  phone,
  billing_line,
  billing_city,
  gstin,
  notify_prefs
) on public.users to authenticated;

alter table public.users
  alter column notify_prefs set default jsonb_build_object(
    'email', true,
    'published', true,
    'updated', true,
    'payments', true,
    'product', false
  );

alter table public.users drop constraint if exists users_billing_country_check;
alter table public.users drop constraint if exists users_billing_postal_check;
alter table public.users drop constraint if exists users_billing_state_check;

alter table public.users
  drop column if exists billing_country,
  drop column if exists billing_postal,
  drop column if exists billing_state;
