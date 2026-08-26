drop policy if exists domains_delete_own on public.domains;
drop policy if exists domains_update_own on public.domains;
drop policy if exists domains_insert_own on public.domains;
drop policy if exists domains_select_own on public.domains;
drop trigger if exists domains_set_updated_at on public.domains;
drop index if exists public.domains_status_idx;
drop index if exists public.domains_user_id_idx;
drop index if exists public.domains_project_id_idx;
drop table if exists public.domains;
