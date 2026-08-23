-- Rollback for 20260823120000_subscription_plans.sql
--
-- Postgres cannot drop a single enum value, so the enum additions ('premium')
-- are left in place; they are harmless if unused. This reverts the parts that
-- can be reverted: the payments table and the widened CHECK constraint.

drop table if exists public.payments;

alter table public.entitlements drop constraint if exists entitlements_check;
alter table public.entitlements add constraint entitlements_check check (
  ((kind = 'pro' and project_id is null))
  or (kind in ('publish', 'edit_unlock') and project_id is not null)
);
