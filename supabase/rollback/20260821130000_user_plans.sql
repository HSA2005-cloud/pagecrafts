-- Reverses 20260821130000_user_plans.sql.

drop policy if exists plan_purchases_select_own on public.plan_purchases;
drop table if exists public.plan_purchases;

drop trigger if exists users_enforce_plan_write on public.users;
drop function if exists public.enforce_plan_write_role();

alter table public.users
  drop column if exists plan;

drop type if exists public.user_plan;
