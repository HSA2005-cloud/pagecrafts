revoke update (notify_prefs) on public.users from authenticated;
grant update (handle, avatar_url, training_opt_in, phone, billing_line, billing_city, gstin)
  on public.users to authenticated;

alter table public.users drop column if exists notify_prefs;
