-- -----------------------------------------------------------------------------
-- RUN_ALL_MIGRATIONS.sql (auto-generated)
-- Generated: 2026-02-17
-- Purpose: Convenience script to execute ALL migrations in order (idempotent).
-- Recommended: Run in Supabase SQL Editor as role "postgres".
-- -----------------------------------------------------------------------------

begin;

-- ===========================================================================
-- Migration: 20260127_01_profiles_avatar_url.sql
-- ===========================================================================

-- 2026-01-27: Add avatar_url to mums_profiles (profile photos stored in Storage public bucket)
-- Safe to run multiple times.

alter table if exists public.mums_profiles
  add column if not exists avatar_url text;

-- Optional: keep updated_at correct (trigger is already created in schema.sql).


-- ===========================================================================
-- Migration: 20260127_02_storage_public_bucket.sql
-- ===========================================================================

-- 2026-01-27: Supabase Storage public bucket bootstrap (optional)
--
-- Goal: Create a PUBLIC bucket (default name: "public") for avatars and other images.
--
-- IMPORTANT
-- - This app performs SERVER-SIDE uploads only (Vercel /api/users/upload_avatar).
-- - Client-side upload policies are not required.
-- - Public reads are allowed by marking the bucket public.
--
-- If you want a different bucket name, set the Vercel env var:
--   SUPABASE_PUBLIC_BUCKET=<your_bucket>

-- 1) Create/ensure a public bucket named "public".
-- NOTE: Storage schema may differ across Supabase versions; if this fails,
-- create the bucket from the UI instead.
insert into storage.buckets (id, name, public)
values ('public', 'public', true)
on conflict (id) do update set public = true;

-- 2) OPTIONAL RLS policies for storage.objects
-- If you have RLS enabled on storage.objects and you want explicit read rules,
-- you may enable these. Public buckets usually do not require these for reads.
--
-- alter table storage.objects enable row level security;
--
-- -- Allow anyone (including anon) to read objects in the public bucket.
-- drop policy if exists "Public bucket read" on storage.objects;
-- create policy "Public bucket read" on storage.objects
-- for select
-- using (bucket_id = 'public');
--
-- -- Block client-side writes (uploads are server-side only). This is the default
-- -- if you do not create any insert/update policies for authenticated/anon.


-- ===========================================================================
-- Migration: 20260128_01_profiles_team_override.sql
-- ===========================================================================

-- MUMS: SUPER_ADMIN team override
-- Allows SUPER_ADMIN to optionally assign themselves to a shift team while defaulting to Developer Access.

alter table if exists public.mums_profiles
  add column if not exists team_override boolean not null default false;

-- Backfill: SUPER roles infer override from whether a team_id is set.
update public.mums_profiles
set team_override = (team_id is not null)
where upper(coalesce(role,'')) in ('SUPER_ADMIN','SUPER_USER');

-- Enforce default Developer Access for SUPER roles without override.
update public.mums_profiles
set team_id = null
where upper(coalesce(role,'')) in ('SUPER_ADMIN','SUPER_USER')
  and team_override = false;


-- ===========================================================================
-- Migration: 20260128_02_deduplicate_supermace.sql
-- ===========================================================================

-- MUMS Step 2: Deduplicate Super Mace (and any other accidental duplicates) by email
-- Goal:
--   1) Ensure only one mums_profiles row exists for email supermace@mums.local
--   2) Enforce a unique constraint on mums_profiles.email going forward
-- Notes:
--   - Your current mums_profiles schema does NOT include an email column. This migration adds it.
--   - This migration intentionally does NOT touch auth.users (Supabase Auth) records.

-- 1) Enable CITEXT for case-insensitive email.
create extension if not exists citext;

-- 2) Add email column (nullable) to mums_profiles.
alter table if exists public.mums_profiles
  add column if not exists email citext;

-- 3) Backfill/refresh email from auth.users (authoritative source).
--    We overwrite to guarantee alignment.
update public.mums_profiles p
set email = lower(trim(u.email))::citext
from auth.users u
where u.id = p.user_id
  and u.email is not null;

-- Normalize blanks to NULL (defensive).
update public.mums_profiles
set email = null
where email is not null and btrim(email::text) = '';

-- 4) Delete duplicate profile rows by email, keeping the best candidate.
--    Keep order:
--      - SUPER_ADMIN first
--      - then SUPER_USER
--      - then most recently updated
--      - then newest created
with ranked as (
  select
    user_id,
    lower(email::text) as email_key,
    row_number() over (
      partition by lower(email::text)
      order by
        (upper(coalesce(role,'')) = 'SUPER_ADMIN') desc,
        (upper(coalesce(role,'')) = 'SUPER_USER') desc,
        updated_at desc nulls last,
        created_at desc nulls last
    ) as rn
  from public.mums_profiles
  where email is not null
)
delete from public.mums_profiles p
using ranked r
where p.user_id = r.user_id
  and r.rn > 1;

-- 5) Safety check: fail migration if duplicates still exist (should never happen after delete above).
do $$
begin
  if exists (
    select 1
    from public.mums_profiles
    where email is not null
    group by lower(email::text)
    having count(*) > 1
  ) then
    raise exception 'Deduplication failed: duplicate emails still exist in public.mums_profiles.';
  end if;
end $$;

-- 6) Enforce uniqueness on email going forward.
--    (Unique allows multiple NULLs, which is fine; email is populated from auth.users.)
alter table if exists public.mums_profiles
  drop constraint if exists mums_profiles_email_unique;

alter table if exists public.mums_profiles
  add constraint mums_profiles_email_unique unique (email);


-- ===========================================================================
-- Migration: 20260130_01_mums_sync_log.sql
-- ===========================================================================

--------------------------------------------------------------------------------
-- 2026-01-30: MUMS - Audit log for mailbox override changes (safe migration)
-- Creates mums_sync_log if it does not exist.
-- Required constraints:
--   - user_id is NOT NULL
--------------------------------------------------------------------------------

create table if not exists public.mums_sync_log (
  id bigserial primary key,
  user_id uuid not null,
  scope text not null check (scope in ('global','superadmin')),
  "timestamp" timestamptz not null default now(),
  effective_time timestamptz,
  action text not null
);

create index if not exists mums_sync_log_timestamp_idx
  on public.mums_sync_log ("timestamp" desc);

create index if not exists mums_sync_log_scope_idx
  on public.mums_sync_log (scope);

--------------------------------------------------------------------------------
-- NOTE:
-- RLS is not enabled here. If you enable RLS in the future, ensure that:
--   - Only SUPER_ADMIN can insert rows (server already enforces).
--   - Read permissions are aligned with your audit visibility requirements.
--------------------------------------------------------------------------------


-- ===========================================================================
-- Migration: 20260130_01_rls_profiles_select_own.sql
-- ===========================================================================

DROP POLICY IF EXISTS profiles_select_own ON public.mums_profiles;
CREATE POLICY profiles_select_own
ON public.mums_profiles
FOR SELECT
USING (user_id = (select auth.uid()));
ALTER TABLE public.mums_profiles ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- Migration: 20260201_01_heartbeat_table.sql
-- ===========================================================================

--------------------------------------------------------------------------------
-- 2026-02-01: Keep-alive heartbeat table (lightweight)
-- Used by /api/keep_alive to prevent Supabase project pausing on free plans.

create table if not exists public.heartbeat (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz default now()
);

-- Keep lightweight: no indexes required.
-- RLS is OFF by default for new tables; keep it disabled.
alter table public.heartbeat disable row level security;


-- ===========================================================================
-- Migration: 20260203_01_heartbeat_uid_rls.sql
-- ===========================================================================

--------------------------------------------------------------------------------
-- 2026-02-03: Heartbeat RLS alignment (uid column + per-user policies)
--
-- Goal:
-- - Add uid column so authenticated clients can write/read their own heartbeat
-- - Enable RLS and enforce per-user access
-- - Keep server-side keep-alive working (service role bypasses RLS)
--------------------------------------------------------------------------------

-- Add user identifier column for RLS enforcement
alter table if exists public.heartbeat
  add column if not exists uid uuid;

-- Enable Row Level Security
alter table public.heartbeat enable row level security;

-- Policies (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'heartbeat'
      and policyname = 'User can read own heartbeat'
  ) then
    create policy "User can read own heartbeat"
    on public.heartbeat
    for select
    using (auth.uid() = uid);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'heartbeat'
      and policyname = 'User can insert own heartbeat'
  ) then
    create policy "User can insert own heartbeat"
    on public.heartbeat
    for insert
    with check (auth.uid() = uid);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'heartbeat'
      and policyname = 'User can update own heartbeat'
  ) then
    create policy "User can update own heartbeat"
    on public.heartbeat
    for update
    using (auth.uid() = uid)
    with check (auth.uid() = uid);
  end if;
end
$$;


-- ===========================================================================
-- Migration: 20260214_01_invite_only_azure_guard.sql
-- ===========================================================================

-- 2026-02-14: Invite-only Azure OAuth guard for auth.users
--
-- Goal:
-- - On new auth.users row insertion, require a pre-existing whitelist row in public.mums_profiles by email.
-- - If matched (case-insensitive), attach auth.users.id to the existing profile row.
-- - If no match, raise an exception to abort signup/login.

create extension if not exists citext;

create or replace function public.mums_link_auth_user_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_profile_exists boolean;
begin
  v_email := lower(trim(coalesce(new.email, '')));

  if v_email = '' then
    raise exception using
      errcode = 'P0001',
      message = 'Invite-only login denied: missing email.';
  end if;

  select exists (
    select 1
    from public.mums_profiles p
    where lower(trim(coalesce(p.email::text, ''))) = v_email
  )
  into v_profile_exists;

  if not v_profile_exists then
    raise exception using
      errcode = 'P0001',
      message = format('Invite-only login denied for email: %s', v_email);
  end if;

  update public.mums_profiles p
  set user_id = new.id,
      updated_at = now()
  where lower(trim(coalesce(p.email::text, ''))) = v_email;

  return new;
end;
$$;

drop trigger if exists trg_mums_link_auth_user_to_profile on auth.users;

create trigger trg_mums_link_auth_user_to_profile
after insert on auth.users
for each row
execute function public.mums_link_auth_user_to_profile();


-- ===========================================================================
-- Migration: 20260215_01_task_items_reference_url_and_distribution_idx.sql
-- ===========================================================================

-- 2026-02-15: Task orchestration high-volume support
-- 1) Add optional reference_url to task_items for OneDrive/SharePoint links.
-- 2) Ensure distribution_id has an index for faster grouping/aggregation.

alter table if exists public.task_items
  add column if not exists reference_url text;

create index if not exists task_items_distribution_id_idx
  on public.task_items (distribution_id);


-- ===========================================================================
-- Migration: 20260216_01_task_orchestration_core.sql
-- ===========================================================================

-- 2026-02-16: Task Orchestration Core (Distributions + Items)
--
-- Why:
-- - /api/tasks/* endpoints expect these objects to exist.
-- - Missing tables/views will cause 500s like "distribution_create_failed".
--
-- Safe to run multiple times.

--------------------------------------------------------------------------------
-- UUID generator (Supabase usually has this, but keep it safe/idempotent)
--------------------------------------------------------------------------------

create extension if not exists pgcrypto;

--------------------------------------------------------------------------------
-- task_distributions
--------------------------------------------------------------------------------

create table if not exists public.task_distributions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  title text not null,
  description text,
  reference_url text,
  status text not null default 'ONGOING'
);

create index if not exists task_distributions_created_by_idx
  on public.task_distributions (created_by);

--------------------------------------------------------------------------------
-- task_items
--------------------------------------------------------------------------------

create table if not exists public.task_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  distribution_id uuid not null references public.task_distributions(id) on delete cascade,

  -- Work metadata
  case_number text not null,
  site text not null,

  -- Assignee
  assigned_to uuid not null,

  -- Task details
  task_description text not null,
  description text,
  remarks text,
  reference_url text,
  status text not null default 'PENDING'
);

create index if not exists task_items_distribution_id_idx
  on public.task_items (distribution_id);

create index if not exists task_items_assigned_to_idx
  on public.task_items (assigned_to);

--------------------------------------------------------------------------------
-- view: team workload matrix
-- NOTE: This view depends on task_items.status. We normalize/cast status to the
-- enum type later in this script, so we DEFER creating the view until AFTER the
-- status conversion. We still drop any existing view here to keep reruns safe.
--------------------------------------------------------------------------------

drop view if exists public.view_team_workload_matrix;


-- ===========================================================================
-- Migration: 20260217_01_security_advisor_hardening.sql
-- ===========================================================================

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
-- Re-apply search_path hardening for auth->profile linking helper
create or replace function public.mums_link_auth_user_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text;
  v_profile_exists boolean;
begin
  v_email := lower(trim(coalesce(new.email, '')));

  if v_email = '' then
    raise exception using
      errcode = 'P0001',
      message = 'Invite-only login denied: missing email.';
  end if;

  select exists (
    select 1
    from public.mums_profiles p
    where lower(trim(coalesce(p.email::text, ''))) = v_email
  )
  into v_profile_exists;

  if not v_profile_exists then
    raise exception using
      errcode = 'P0001',
      message = format('Invite-only login denied for email: %s', v_email);
  end if;

  update public.mums_profiles p
  set user_id = new.id,
      updated_at = now()
  where lower(trim(coalesce(p.email::text, ''))) = v_email;

  return new;
end;
$$;


-- ===========================================================================
-- Migration: 20260217_02_phase1_task_distribution_monitoring.sql
-- ===========================================================================

-- -----------------------------------------------------------------------------
-- 2026-02-17: Phase 1 Foundation — Task Distribution & Monitoring
--
-- Why:
-- - Support richer per-task tracking (status enum, problem notes, audit fields)
-- - Support distribution-level opt-in for daily reminders
--
-- Safe to run multiple times.
-- -----------------------------------------------------------------------------

-- Distribution-level toggle
alter table if exists public.task_distributions
  add column if not exists enable_daily_alerts boolean not null default false;

-- Canonical task status enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_item_status') then
    create type public.task_item_status as enum ('Pending', 'Ongoing', 'Completed', 'With Problem');
  end if;
end $$;

-- New audit/problem fields
alter table if exists public.task_items
  add column if not exists problem_notes text,
  add column if not exists assigned_by uuid,
  add column if not exists transferred_from uuid;

-- Ensure task_items.status uses the enum (migrates legacy values safely)
do $$
declare
  current_udt text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'task_items'
      and column_name = 'status'
  ) then
    select udt_name into current_udt
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'task_items'
      and column_name = 'status'
    limit 1;

    if current_udt is distinct from 'task_item_status' then
      -- Remove default before type cast
      begin
        alter table public.task_items alter column status drop default;
      exception when others then
        -- ignore
      end;

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
        );
    end if;
  else
    alter table public.task_items
      add column status public.task_item_status not null default 'Pending';
  end if;
end $$;

-- Backfill + enforce defaults
update public.task_items set status = 'Pending' where status is null;

alter table public.task_items
  alter column status set default 'Pending',
  alter column status set not null;

-- Workload matrix view (matches /api/tasks/workload_matrix expectations)
drop view if exists public.view_team_workload_matrix;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'mums_profiles'
  )
  or exists (
    select 1
    from information_schema.views
    where table_schema = 'public'
      and table_name = 'mums_profiles'
  ) then
    execute $$
      create view public.view_team_workload_matrix
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
    $$;
  else
    execute $$
      create view public.view_team_workload_matrix
      with (security_invoker = true)
      as
      select
        ti.id as task_item_id,
        ti.status as task_status,
        td.title as distribution_title,
        ti.assigned_to::text as member_name,
        null::text as member_shift,
        coalesce(ti.updated_at, ti.created_at) as last_update
      from public.task_items ti
      join public.task_distributions td on td.id = ti.distribution_id;
    $$;
  end if;
end $$;


commit;

