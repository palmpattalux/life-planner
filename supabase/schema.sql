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

-- Added later: when a page was last opened (the app opens the most recent
-- one), and when it was moved to the trash (deleted for good after 30 days).
alter table public.pages add column if not exists opened_at timestamptz;
alter table public.pages add column if not exists deleted_at timestamptz;

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

-- Added later: Home's to-do list and phase goal, and pictures pasted on boards.

-- Today's to-do list, one row per day (kept 30 days for "View past to-do days").
-- items: [{ id, text, done, link? }]
create table if not exists public.todo_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- The phase goal on Home: its dates and tasks, one per person.
-- tasks: [{ id, text, done, link?, page? }] (page: the task's own page, a
-- "note" in pages).
create table if not exists public.phase_goals (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  unit text,
  start_date date,
  end_date date,
  tasks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- A board text added as a task: whether it's ticked, shared by the text and
-- the task so ticking one ticks the other.
create table if not exists public.task_links (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  done boolean not null default false
);

alter table public.todo_days enable row level security;
alter table public.phase_goals enable row level security;
alter table public.task_links enable row level security;

drop policy if exists "own todo days" on public.todo_days;
create policy "own todo days" on public.todo_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own phase goal" on public.phase_goals;
create policy "own phase goal" on public.phase_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own task links" on public.task_links;
create policy "own task links" on public.task_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Pictures pasted on boards, stored in a folder per person. Anyone with a
-- picture's (unguessable) address can see it, so boards can show them.
insert into storage.buckets (id, name, public)
values ('pictures', 'pictures', true)
on conflict (id) do nothing;

drop policy if exists "own pictures" on storage.objects;
create policy "own pictures" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pictures' and (storage.foldername(name))[1] = auth.uid()::text);
