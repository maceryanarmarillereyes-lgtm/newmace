--------------------------------------------------------------------------------
-- 2026-02-16: Task Orchestration Core (Distributions + Items)
--
-- Why:
-- - /api/tasks/* endpoints expect these objects to exist.
-- - Missing tables/views will cause 500s like "distribution_create_failed".
--
-- Safe to run multiple times.
--------------------------------------------------------------------------------

-- UUID generator (Supabase usually has this, but keep it safe/idempotent)
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- task_distributions
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

-- Ensure columns exist if table was created in a prior incomplete migration.
alter table if exists public.task_distributions
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.task_distributions
  add column if not exists created_by uuid;

alter table if exists public.task_distributions
  add column if not exists title text;

alter table if exists public.task_distributions
  add column if not exists description text;

alter table if exists public.task_distributions
  add column if not exists reference_url text;

alter table if exists public.task_distributions
  add column if not exists status text;

-- Basic status normalization (server uses ONGOING/COMPLETED)
-- Avoid CHECK constraints here to keep compatibility with older rows.

create index if not exists task_distributions_created_by_idx
  on public.task_distributions (created_by);

create index if not exists task_distributions_created_at_idx
  on public.task_distributions (created_at desc);

-- -----------------------------------------------------------------------------
-- task_items
-- -----------------------------------------------------------------------------
create table if not exists public.task_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  distribution_id uuid,
  case_number text not null,
  site text not null,
  description text not null,
  assigned_to uuid not null,
  status text not null default 'PENDING',
  remarks text,
  deadline date,
  deadline_at timestamptz,
  due_at timestamptz,
  reference_url text
);

-- Columns expected by the API (ensure presence for older deployments)
alter table if exists public.task_items
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.task_items
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.task_items
  add column if not exists distribution_id uuid;

alter table if exists public.task_items
  add column if not exists case_number text;

alter table if exists public.task_items
  add column if not exists site text;

alter table if exists public.task_items
  add column if not exists description text;

alter table if exists public.task_items
  add column if not exists assigned_to uuid;

alter table if exists public.task_items
  add column if not exists status text;

alter table if exists public.task_items
  add column if not exists remarks text;

alter table if exists public.task_items
  add column if not exists deadline date;

alter table if exists public.task_items
  add column if not exists deadline_at timestamptz;

alter table if exists public.task_items
  add column if not exists due_at timestamptz;

alter table if exists public.task_items
  add column if not exists reference_url text;

-- FK (idempotent-ish: only add if missing)
-- If an FK already exists with a different name, this block won't add a duplicate.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.task_items'::regclass
      and contype = 'f'
      and conname = 'task_items_distribution_id_fkey'
  ) then
    alter table public.task_items
      add constraint task_items_distribution_id_fkey
      foreign key (distribution_id) references public.task_distributions(id)
      on delete cascade;
  end if;
exception
  when undefined_table then
    -- If tables don't exist for some reason, ignore here.
    null;
end $$;

create index if not exists task_items_assigned_to_idx
  on public.task_items (assigned_to);

-- (Also created in 20260215 migration, safe to keep)
create index if not exists task_items_distribution_id_idx
  on public.task_items (distribution_id);

create index if not exists task_items_status_idx
  on public.task_items (status);

-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_task_items_updated_at'
  ) then
    create trigger set_task_items_updated_at
    before update on public.task_items
    for each row
    execute procedure public.set_updated_at();
  end if;
exception
  when undefined_table then
    null;
end $$;

-- -----------------------------------------------------------------------------
-- Security: Enable RLS and default-deny direct client access.
-- Server APIs use the service role key (bypasses RLS).
-- -----------------------------------------------------------------------------
alter table public.task_distributions enable row level security;
alter table public.task_items enable row level security;

-- Allow authenticated users to read/update ONLY their own assigned task_items.
-- (Optional but useful if you ever decide to query directly from client.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'task_items'
      and policyname = 'Task items: select own'
  ) then
    create policy "Task items: select own"
    on public.task_items
    for select
    using (auth.uid() = assigned_to);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'task_items'
      and policyname = 'Task items: update own'
  ) then
    create policy "Task items: update own"
    on public.task_items
    for update
    using (auth.uid() = assigned_to)
    with check (auth.uid() = assigned_to);
  end if;
end
$$;

-- Owner-only read of distributions (optional).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'task_distributions'
      and policyname = 'Task distributions: select own'
  ) then
    create policy "Task distributions: select own"
    on public.task_distributions
    for select
    using (auth.uid() = created_by);
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Workload view used by /api/tasks/workload_matrix
-- -----------------------------------------------------------------------------
drop view if exists public.view_team_workload_matrix;
create view public.view_team_workload_matrix as
select
  ti.id as task_item_id,
  ti.status as task_status,
  coalesce(td.title, 'Untitled Distribution') as distribution_title,
  coalesce(mp.name, '') as member_name,
  coalesce(mp.duty, '') as member_shift,
  coalesce(ti.updated_at, ti.created_at) as last_update
from public.task_items ti
left join public.task_distributions td on td.id = ti.distribution_id
left join public.mums_profiles mp on mp.user_id = ti.assigned_to;
