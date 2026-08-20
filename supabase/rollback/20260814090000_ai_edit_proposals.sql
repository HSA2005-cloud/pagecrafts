-- Rollback for 20260814090000_ai_edit_proposals.sql
--
-- Written at D20 during the launch-readiness sweep, the second of two migrations that had
-- never been given an undo.
--
-- Dropping the table discards any proposal a user has been shown but not yet accepted or
-- dismissed. That is the correct loss: a proposal is a suggestion held between two
-- requests, never a record of anything the user owns. Nothing in composition.json comes
-- from here until apply has run, and apply consumes the row -- so a dropped proposal can
-- only ever cost someone one click of "suggest again".

drop policy if exists ai_edit_proposals_own on public.ai_edit_proposals;

revoke select, insert, update on public.ai_edit_proposals from authenticated;

drop index if exists public.ai_edit_proposals_project_idx;

drop table if exists public.ai_edit_proposals;
