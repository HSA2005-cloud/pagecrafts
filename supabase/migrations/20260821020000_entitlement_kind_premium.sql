-- Account Premium is a distinct entitlement, not a second price on `pro`.
-- ADD VALUE cannot be used in the same transaction as the new check/index, so this
-- migration only introduces the enum member. The constraint follows in
-- 20260821020001_entitlement_premium.sql.

alter type public.entitlement_kind add value if not exists 'premium';
