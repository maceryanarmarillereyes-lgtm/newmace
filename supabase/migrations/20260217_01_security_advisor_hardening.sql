-- 2026-02-17: Security Advisor hardening
--
-- Addresses common Supabase Security Advisor findings:
-- - SECURITY DEFINER view warning (prefer SECURITY INVOKER)
-- - Functions with mutable/unspecified search_path
-- - Extensions installed in public schema (move to extensions)
--
-- Safe to run multiple times.

--------------------------------------------------------------------------------
-- Ensure extensions schema exists
--------------------------------------------------------------------------------

create schema if not exists extensions;

--------------------------------------------------------------------------------
-- Move citext extension out of public schema (if present)
--------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'citext') then
    if (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'citext') = 'public' then
      execute 'alter extension citext set schema extensions';
    end if;
  end if;
exception when others then
  -- Non-fatal: extension move may require elevated privileges depending on project settings.
  null;
end$$;

--------------------------------------------------------------------------------
-- Set SECURITY INVOKER on workload view if it exists
--------------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'view_team_workload_matrix'
      and c.relkind = 'v'
  ) then
    execute 'alter view public.view_team_workload_matrix set (security_invoker=true)';
  end if;
exception when others then
  null;
end$$;

--------------------------------------------------------------------------------
-- Harden trigger/util functions: set explicit search_path
--------------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.mums_set_updated_at()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Re-apply search_path hardening for auth->profile linking helper
create or replace function public.mums_link_auth_user_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
