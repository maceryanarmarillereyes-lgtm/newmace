-- MUMS Supabase schema (Vercel-ready)
-- Run in Supabase SQL editor.

-- 1) Profiles (authoritative user directory)
create table if not exists public.mums_profiles (
  user_id uuid primary key,
  username text unique not null,
  name text not null,
  role text not null check (role in ('SUPER_ADMIN','TEAM_LEAD','ADMIN','MEMBER')),
  team_id text,
  duty text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profiles_updated_at on public.mums_profiles;
create trigger trg_profiles_updated_at
before update on public.mums_profiles
for each row execute function public.set_updated_at();

-- 2) Cloud-global mailbox override
create table if not exists public.mums_mailbox_override (
  scope text not null check (scope in ('global','superadmin')),
  enabled boolean not null default false,
  freeze boolean not null default true,
  override_iso text not null default '',
  updated_by uuid,
  updated_at timestamptz default now(),
  primary key (scope)
);

drop trigger if exists trg_mailbox_override_updated_at on public.mums_mailbox_override;
create trigger trg_mailbox_override_updated_at
before update on public.mums_mailbox_override
for each row execute function public.set_updated_at();

insert into public.mums_mailbox_override (scope, enabled, freeze, override_iso)
values ('global', false, true, ''), ('superadmin', false, true, '')
on conflict (scope) do nothing;

-- --------------------
-- RLS / Policies
-- --------------------
alter table public.mums_profiles enable row level security;
alter table public.mums_mailbox_override enable row level security;

-- Allow users to read their own profile
drop policy if exists "profiles_select_own" on public.mums_profiles;
create policy "profiles_select_own" on public.mums_profiles
for select to authenticated
using (auth.uid() = user_id);

-- Allow SUPER_ADMIN to read all profiles (for UI directory)
drop policy if exists "profiles_select_superadmin" on public.mums_profiles;
create policy "profiles_select_superadmin" on public.mums_profiles
for select to authenticated
using (
  exists (
    select 1 from public.mums_profiles p
    where p.user_id = auth.uid() and p.role = 'SUPER_ADMIN'
  )
);

-- Mailbox override: any authenticated user can read global override
drop policy if exists "override_select_auth" on public.mums_mailbox_override;
create policy "override_select_auth" on public.mums_mailbox_override
for select to authenticated
using (true);

-- Mailbox override: only SUPER_ADMIN can update
drop policy if exists "override_update_superadmin" on public.mums_mailbox_override;
create policy "override_update_superadmin" on public.mums_mailbox_override
for update to authenticated
using (
  exists (
    select 1 from public.mums_profiles p
    where p.user_id = auth.uid() and p.role = 'SUPER_ADMIN'
  )
)
with check (
  exists (
    select 1 from public.mums_profiles p
    where p.user_id = auth.uid() and p.role = 'SUPER_ADMIN'
  )
);

-- NOTE: Presence tables are created by the app; you may optionally enable RLS there too.
