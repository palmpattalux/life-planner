-- Life Planner database setup.
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

-- A phase is a chapter of your life, e.g. "2026-27: Build my career".
create table if not exists public.phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  focus text,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  constraint phase_dates check (end_date is null or end_date >= start_date)
);

-- Goals and events that belong to a phase.
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  phase_id uuid not null references public.phases (id) on delete cascade,
  kind text not null check (kind in ('goal', 'event')),
  title text not null,
  notes text,
  date date,
  done boolean not null default false,
  priority boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists phases_user_idx on public.phases (user_id, start_date);
create index if not exists items_phase_idx on public.items (phase_id);

-- Row Level Security: every person can only see and change their own rows.
alter table public.phases enable row level security;
alter table public.items enable row level security;

drop policy if exists "own phases" on public.phases;
create policy "own phases" on public.phases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own items" on public.items;
create policy "own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
