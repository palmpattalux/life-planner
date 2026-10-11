-- Life Planner database setup.
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Running it again is safe.

-- Pages: boards (the whiteboard) and notes. A note can hold pages of its own
-- (parent_id points at the page it sits in; top-level pages show on Home).
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid references public.pages (id) on delete cascade,
  kind text not null check (kind in ('board', 'note')),
  title text not null default '',
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Presets: groups of board things saved to be placed on any board again.
create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists pages_user_idx on public.pages (user_id, parent_id, updated_at desc);
create index if not exists presets_user_idx on public.presets (user_id, created_at);

-- Row Level Security: every person can only see and change their own rows.
alter table public.pages enable row level security;
alter table public.presets enable row level security;

drop policy if exists "own pages" on public.pages;
create policy "own pages" on public.pages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own presets" on public.presets;
create policy "own presets" on public.presets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Old tables from the first version, no longer used.
drop table if exists public.items;
drop table if exists public.phases;
