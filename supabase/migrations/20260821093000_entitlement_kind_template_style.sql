-- Per-item unlocks: a catalogue template, or one of the generated looks.
-- ADD VALUE cannot be used in the same transaction as the new columns/checks.

alter type public.entitlement_kind add value if not exists 'template';
alter type public.entitlement_kind add value if not exists 'style';
