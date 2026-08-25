-- Billing address: state, postal code, country for receipts.
-- Card and bank numbers stay with Razorpay.

alter table public.users
  add column if not exists billing_state text,
  add column if not exists billing_postal text,
  add column if not exists billing_country text;

alter table public.users
  drop constraint if exists users_billing_state_check;
alter table public.users
  add constraint users_billing_state_check
  check (billing_state is null or char_length(billing_state) <= 80);

alter table public.users
  drop constraint if exists users_billing_postal_check;
alter table public.users
  add constraint users_billing_postal_check
  check (billing_postal is null or char_length(billing_postal) <= 20);

alter table public.users
  drop constraint if exists users_billing_country_check;
alter table public.users
  add constraint users_billing_country_check
  check (billing_country is null or char_length(billing_country) <= 80);

-- Security alerts replace product announcements in the default notice prefs.
alter table public.users
  alter column notify_prefs set default jsonb_build_object(
    'email', true,
    'published', true,
    'updated', true,
    'payments', true,
    'security', true
  );

grant update (
  handle,
  avatar_url,
  training_opt_in,
  phone,
  billing_line,
  billing_city,
  billing_state,
  billing_postal,
  billing_country,
  gstin,
  notify_prefs
) on public.users to authenticated;

comment on column public.users.billing_state is 'State or region printed on a bill.';
comment on column public.users.billing_postal is 'PIN or ZIP code printed on a bill.';
comment on column public.users.billing_country is 'Country printed on a bill.';
