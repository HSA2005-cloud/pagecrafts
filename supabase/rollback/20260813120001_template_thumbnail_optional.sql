-- Rollback for 20260813120001_template_thumbnail_optional.sql
--
-- Note for whoever reaches for this: 20260813120001 and 20260813130000 are byte-identical
-- migrations. The duplicate survived the D13 timestamp-collision cleanup because the two
-- files have different versions, so the collision test did not see them -- and only the
-- second application is a no-op, which is why nothing ever failed and nobody noticed.
--
-- Reversing the change means running this once, not twice. It is provided so the pack has
-- an undo for every migration rather than because both need one.
--
-- Restores the original D2 shape: every template must carry an absolute https URL. This
-- will fail if any row has a null thumbnail_url, and that is correct. You cannot go back
-- to "every design has a thumbnail" while designs have no thumbnails -- reversing this
-- means rendering them first, not inventing a URL. Fill the column, then run this.

alter table public.templates
  drop constraint if exists templates_thumbnail_url_check;

alter table public.templates
  alter column thumbnail_url set not null;

alter table public.templates
  add constraint templates_thumbnail_url_check
  check (thumbnail_url ~ '^https://');
