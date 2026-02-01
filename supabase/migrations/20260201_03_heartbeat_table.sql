--------------------------------------------------------------------------------
-- 2026-02-01: Keep-Alive heartbeat table
-- Purpose: Lightweight activity to prevent Supabase project pausing due to inactivity.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.heartbeat (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now()
);

-- Keep RLS OFF for ultra-lightweight, public inserts.
-- Grants are required because new tables default to owner-only.
grant insert on table public.heartbeat to anon, authenticated;
grant select on table public.heartbeat to anon, authenticated;
