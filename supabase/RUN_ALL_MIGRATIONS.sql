-- RUN_ALL_MIGRATIONS.sql
-- Generated: 2026-01-28 14:16:12 UTC
-- Purpose: Convenience script to run all Supabase migrations for MUMS in a single SQL Editor execution.
--
-- Notes:
-- 1) This script concatenates the contents of each migration file in lexicographic order.
-- 2) Some migrations may not be fully idempotent; re-running may fail if objects already exist.
-- 3) Recommended: run in a maintenance window; keep "Role" as postgres in Supabase SQL Editor.
--
-- Included migrations (in order):
--   - 20260127_01_profiles_avatar_url.sql
--   - 20260127_02_storage_public_bucket.sql
--   - 20260128_01_profiles_team_override.sql
--   - 20260128_02_deduplicate_supermace.sql


--------------------------------------------------------------------------------
-- BEGIN 20260127_01_profiles_avatar_url.sql

--------------------------------------------------------------------------------
-- 2026-01-27: Add avatar_url to mums_profiles (profile photos stored in Storage public bucket)
-- Safe to run multiple times.

alter table if exists public.mums_profiles
  add column if not exists avatar_url text;

-- Optional: keep updated_at correct (trigger is already created in schema.sql).

--------------------------------------------------------------------------------
-- END 20260127_01_profiles_avatar_url.sql

--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- BEGIN 20260127_02_storage_public_bucket.sql

--------------------------------------------------------------------------------
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

--------------------------------------------------------------------------------
-- END 20260127_02_storage_public_bucket.sql

--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- BEGIN 20260128_01_profiles_team_override.sql

--------------------------------------------------------------------------------
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

--------------------------------------------------------------------------------
-- END 20260128_01_profiles_team_override.sql

--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- BEGIN 20260128_02_deduplicate_supermace.sql

--------------------------------------------------------------------------------
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

--------------------------------------------------------------------------------
-- END 20260128_02_deduplicate_supermace.sql

--------------------------------------------------------------------------------
