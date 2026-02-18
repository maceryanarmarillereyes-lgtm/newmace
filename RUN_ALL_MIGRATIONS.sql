-- RUN_ALL_MIGRATIONS.sql (PHASE 3 HOTFIX)
-- Purpose: Idempotent schema repair for Phase 3 features.
-- Safe to run multiple times on an existing Supabase project.

begin;

-- Extensions
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Core documents store (notifications feed uses mums_documents)
-- -----------------------------------------------------------------------------
create table if not exists public.mums_documents (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Updated-at trigger helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'mums_documents'
  ) then
    begin
      execute 'drop trigger if exists trg_mums_documents_updated_at on public.mums_documents';
    exception when others then
      -- ignore
    end;

    begin
      execute 'create trigger trg_mums_documents_updated_at before update on public.mums_documents for each row execute function public.set_updated_at()';
    exception when others then
      -- ignore
    end;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Task distributions (Phase 1/2/3)
-- -----------------------------------------------------------------------------
create table if not exists public.task_distributions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  title text not null,
  description text,
  reference_url text,
  status text not null default 'ONGOING'
);

alter table if exists public.task_distributions
  add column if not exists enable_daily_alerts boolean not null default false;

create index if not exists task_distributions_created_by_idx
  on public.task_distributions (created_by);

-- -----------------------------------------------------------------------------
-- Task items (Phase 1/2/3) — MUST include status + problem_notes + transferred_from
-- -----------------------------------------------------------------------------
create table if not exists public.task_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  distribution_id uuid not null references public.task_distributions(id) on delete cascade,

  case_number text not null,
  site text not null,
  assigned_to uuid not null,

  task_description text not null,
  description text,
  remarks text,
  reference_url text,

  status text not null default 'Pending'
);

-- Ensure required columns always exist (idempotent)
alter table if exists public.task_items
  add column if not exists status text,
  add column if not exists problem_notes text,
  add column if not exists transferred_from uuid,
  add column if not exists assigned_by uuid;

-- Ensure status defaults + constraints (safe even if older rows exist)
update public.task_items set status = 'Pending' where status is null;

do $$
begin
  begin
    execute 'alter table public.task_items alter column status set default ''Pending''';
  exception when others then
    -- ignore
  end;
  begin
    execute 'alter table public.task_items alter column status set not null';
  exception when others then
    -- ignore
  end;
end $$;

create index if not exists task_items_distribution_id_idx
  on public.task_items (distribution_id);

create index if not exists task_items_assigned_to_idx
  on public.task_items (assigned_to);

-- -----------------------------------------------------------------------------
-- Optional: canonical status enum (best-effort, non-blocking)
-- -----------------------------------------------------------------------------
do $do$
begin
  if not exists (select 1 from pg_type where typname = 'task_item_status') then
    create type public.task_item_status as enum ('Pending', 'Ongoing', 'Completed', 'With Problem');
  end if;
exception when others then
  -- ignore
end $do$;

-- Best-effort: cast status column to enum (do NOT fail the migration)
do $do$
declare
  current_udt text;
begin
  -- Drop dependent view first to avoid "cannot alter type ... used by a view" errors
  begin
    execute 'drop view if exists public.view_team_workload_matrix';
  exception when others then
    -- ignore
  end;

  begin
    select udt_name into current_udt
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'task_items'
      and column_name = 'status'
    limit 1;
  exception when others then
    current_udt := null;
  end;

  if current_udt is not null and current_udt is distinct from 'task_item_status' then
    begin
      execute 'alter table public.task_items alter column status drop default';
    exception when others then
      -- ignore
    end;

    begin
      execute $$
        alter table public.task_items
          alter column status type public.task_item_status
          using (
            case upper(status::text)
              when 'PENDING' then 'Pending'::public.task_item_status
              when 'IN_PROGRESS' then 'Ongoing'::public.task_item_status
              when 'ONGOING' then 'Ongoing'::public.task_item_status
              when 'DONE' then 'Completed'::public.task_item_status
              when 'COMPLETED' then 'Completed'::public.task_item_status
              when 'WITH_PROBLEM' then 'With Problem'::public.task_item_status
              when 'WITH PROBLEM' then 'With Problem'::public.task_item_status
              else 'Pending'::public.task_item_status
            end
          )
      $$;
    exception when others then
      -- keep as text if cast fails
    end;

    begin
      execute 'alter table public.task_items alter column status set default ''Pending''';
    exception when others then
      -- ignore
    end;
  end if;
end $do$;

-- -----------------------------------------------------------------------------
-- Best-effort: recreate workload view (safe if mums_profiles is missing)
-- -----------------------------------------------------------------------------
do $do$
begin
  begin
    execute $view$
      create or replace view public.view_team_workload_matrix
      with (security_invoker = true)
      as
      select
        ti.id as task_item_id,
        ti.status as task_status,
        td.title as distribution_title,
        coalesce(mp.name, mp.username, mp.user_id::text) as member_name,
        mp.duty as member_shift,
        coalesce(ti.updated_at, ti.created_at) as last_update
      from public.task_items ti
      join public.task_distributions td on td.id = ti.distribution_id
      left join public.mums_profiles mp on mp.user_id = ti.assigned_to;
    $view$;
  exception when others then
    -- ignore
  end;
end $do$;

-- -----------------------------------------------------------------------------
-- Force PostgREST schema cache reload
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

commit;
