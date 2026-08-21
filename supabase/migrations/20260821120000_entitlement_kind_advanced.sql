-- AI usage packages (separate from catalogue Starter / Pro / Premium designs).
-- advanced = account AI package (Rs 699) — higher generation limit per site.

alter type public.entitlement_kind add value if not exists 'advanced';
