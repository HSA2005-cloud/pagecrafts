-- Which email notices this account wants. Off for product mail unless they turn it on.

alter table public.users
  add column if not exists notify_prefs jsonb not null default jsonb_build_object(
    'email', true,
    'published', true,
    'updated', true,
    'payments', true,
    'product', false
  );

grant update (handle, avatar_url, training_opt_in, phone, billing_line, billing_city, gstin, notify_prefs)
  on public.users to authenticated;

comment on column public.users.notify_prefs is 'Which email notices this account wants. Never a card or bank number.';
