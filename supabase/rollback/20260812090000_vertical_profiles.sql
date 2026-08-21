-- Rollback for 20260812090000_vertical_profiles.sql
--
-- Written at D20 during the launch-readiness sweep: one of two migrations in the pack
-- with no undo, which meant a bad deploy of it could only be reversed by hand at exactly
-- the moment nobody wants to be writing SQL from memory.
--
-- Dropping the tables takes the cached profiles with them. That is a cache, not a source
-- of truth -- every profile is derived from its vertical slug and is regenerated on the
-- next request. The cost of losing them is provider calls, not data.

drop policy if exists vertical_profile_aliases_read on public.vertical_profile_aliases;
drop policy if exists vertical_profiles_read on public.vertical_profiles;

drop trigger if exists vertical_profiles_set_updated_at on public.vertical_profiles;

revoke select on public.vertical_profile_aliases from authenticated;
revoke select on public.vertical_profiles from authenticated;

drop index if exists public.vertical_profiles_status_usage_idx;
drop index if exists public.vertical_profile_aliases_slug_idx;

-- Aliases first: it references the profiles table.
drop table if exists public.vertical_profile_aliases;
drop table if exists public.vertical_profiles;
