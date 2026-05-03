-- FlowDesk Initial Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ─────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────
-- profiles  (1:1 with auth.users, holds public metadata)
-- ─────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────
-- workspaces
-- ─────────────────────────────────────────────────────────
create table public.workspaces (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  icon text not null,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_user_id_idx on public.workspaces(user_id);

-- ─────────────────────────────────────────────────────────
-- categories
-- ─────────────────────────────────────────────────────────
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_collapsed boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_user_id_idx on public.categories(user_id);
create index categories_workspace_id_idx on public.categories(workspace_id);

-- ─────────────────────────────────────────────────────────
-- tasks
-- ─────────────────────────────────────────────────────────
create type task_type_enum as enum ('one_time', 'routine', 'project');
create type recurrence_type_enum as enum ('daily', 'weekly', 'monthly', 'custom');

create table public.tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  title text not null,
  description text,
  task_type task_type_enum not null default 'one_time',
  urgency smallint not null default 5 check (urgency between 1 and 10),
  estimated_minutes integer,
  actual_minutes integer,
  due_date date,
  scheduled_date date,
  scheduled_start_time time,
  scheduled_end_time time,
  calendar_color text not null default '#3b82f6',
  is_completed boolean not null default false,
  completed_at timestamptz,
  is_archived boolean not null default false,
  archived_at timestamptz,
  notes text,
  sort_order integer not null default 0,
  -- Recurrence
  is_recurring boolean not null default false,
  recurrence_type recurrence_type_enum,
  recurrence_interval integer,
  recurrence_days_of_week integer[],
  recurrence_end_date date,
  -- Google Calendar sync (placeholder for later phase)
  google_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_id_idx on public.tasks(user_id);
create index tasks_category_id_idx on public.tasks(category_id);
create index tasks_workspace_id_idx on public.tasks(workspace_id);
create index tasks_scheduled_date_idx on public.tasks(scheduled_date) where scheduled_date is not null;
create index tasks_due_date_idx on public.tasks(due_date) where due_date is not null;

-- ─────────────────────────────────────────────────────────
-- journal_entries
-- ─────────────────────────────────────────────────────────
create type mood_enum as enum ('great', 'good', 'neutral', 'bad', 'terrible');

create table public.journal_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  content text,
  mood mood_enum,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index journal_entries_user_id_idx on public.journal_entries(user_id);

-- ─────────────────────────────────────────────────────────
-- journal_photos
-- ─────────────────────────────────────────────────────────
create table public.journal_photos (
  id uuid primary key default uuid_generate_v4(),
  journal_id uuid not null references public.journal_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index journal_photos_user_id_idx on public.journal_photos(user_id);
create index journal_photos_journal_id_idx on public.journal_photos(journal_id);

-- ─────────────────────────────────────────────────────────
-- scratchpad_items
-- ─────────────────────────────────────────────────────────
create type scratchpad_type_enum as enum ('text', 'image', 'link');

create table public.scratchpad_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  type scratchpad_type_enum not null,
  content text not null,
  title text,
  created_at timestamptz not null default now()
);
create index scratchpad_items_user_id_idx on public.scratchpad_items(user_id);
create index scratchpad_items_date_idx on public.scratchpad_items(user_id, date);

-- ─────────────────────────────────────────────────────────
-- time_blocks
-- ─────────────────────────────────────────────────────────
create table public.time_blocks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  type text not null,
  label text not null,
  color text not null,
  is_recurring boolean not null default false,
  recurrence_rule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index time_blocks_user_id_idx on public.time_blocks(user_id);
create index time_blocks_date_idx on public.time_blocks(user_id, date);

-- ─────────────────────────────────────────────────────────
-- slot_types  (customizable time-block categories per user)
-- ─────────────────────────────────────────────────────────
create type icon_type_enum as enum ('lucide', 'custom', 'emoji');

create table public.slot_types (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  label text not null,
  description text not null default '',
  icon text not null,
  icon_type icon_type_enum not null default 'lucide',
  color text not null,
  parent_id uuid references public.slot_types(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  sort_order integer not null default 0,
  is_built_in boolean not null default false,
  created_at timestamptz not null default now()
);
create index slot_types_user_id_idx on public.slot_types(user_id);

-- ─────────────────────────────────────────────────────────
-- user_settings  (1:1 with user, JSONB for nested config)
-- ─────────────────────────────────────────────────────────
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calendar_start_hour smallint not null default 6,
  calendar_end_hour smallint not null default 23,
  default_view text not null default 'week' check (default_view in ('day','week','month')),
  week_start_day smallint not null default 1 check (week_start_day between 0 and 6),
  weather_city text not null default 'Taipei',
  weather_unit text not null default 'celsius' check (weather_unit in ('celsius','fahrenheit')),
  lunch_break jsonb not null default '{"enabled":true,"startTime":"12:00","endTime":"13:00","color":"#fbbf24"}'::jsonb,
  buffer_time jsonb not null default '{"enabled":true,"defaultDuration":15,"color":"#94a3b8"}'::jsonb,
  default_task_colors jsonb not null default '{}'::jsonb,
  notifications jsonb not null default '{}'::jsonb,
  google_calendar_connected boolean not null default false,
  google_calendar_sync_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_workspaces_updated before update on public.workspaces
  for each row execute function public.set_updated_at();
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger trg_journal_entries_updated before update on public.journal_entries
  for each row execute function public.set_updated_at();
create trigger trg_time_blocks_updated before update on public.time_blocks
  for each row execute function public.set_updated_at();
create trigger trg_user_settings_updated before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────
-- Auto-create profile + default settings on signup
-- ─────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.user_settings (user_id) values (new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
