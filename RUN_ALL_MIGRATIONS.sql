-- RUN_ALL_MIGRATIONS.sql (PHASE 3 HOTFIX)
-- Purpose: idempotent schema repair for Phase 3 task tracking.

begin;

create extension if not exists pgcrypto;

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

create table if not exists public.task_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  distribution_id uuid not null references public.task_distributions(id) on delete cascade,
  case_number text not null,
  site text not null,
  assigned_to uuid not null,
  task_description text,
  description text,
  remarks text,
  reference_url text,
  status text not null default 'Pending'
);

alter table if exists public.task_items
  add column if not exists problem_notes text,
  add column if not exists transferred_from uuid;

-- Force status to TEXT (no enum usage) while preserving existing values.
do $do$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'task_items'
      and column_name = 'status'
  ) then
    begin
      execute 'alter table public.task_items alter column status type text using status::text';
    exception when others then
      -- keep migration resilient across mixed states
      null;
    end;

    begin
      execute 'alter table public.task_items alter column status set default ''Pending''';
    exception when others then
      null;
    end;

    begin
      execute 'update public.task_items set status = ''Pending'' where status is null or btrim(status::text) = ''''';
    exception when others then
      null;
    end;

    begin
      execute 'alter table public.task_items alter column status set not null';
    exception when others then
      null;
    end;
  end if;

  begin
    execute $chk$
      alter table public.task_items drop constraint if exists task_item_status_check;
      alter table public.task_items add constraint task_item_status_check
      check (status in ('Pending', 'Ongoing', 'Completed', 'With Problem'));
    $chk$;
  exception when others then
    null;
  end;
end
$do$;

create index if not exists task_items_distribution_id_idx
  on public.task_items (distribution_id);

create index if not exists task_items_assigned_to_idx
  on public.task_items (assigned_to);

create index if not exists task_distributions_created_by_idx
  on public.task_distributions (created_by);

commit;
NOTIFY pgrst, 'reload schema';
