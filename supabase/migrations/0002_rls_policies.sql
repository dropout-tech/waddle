-- FlowDesk Row Level Security Policies
-- Run this AFTER 0001_initial_schema.sql

-- ─────────────────────────────────────────────────────────
-- Enable RLS on all tables
-- ─────────────────────────────────────────────────────────
alter table public.profiles          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.categories        enable row level security;
alter table public.tasks             enable row level security;
alter table public.journal_entries   enable row level security;
alter table public.journal_photos    enable row level security;
alter table public.scratchpad_items  enable row level security;
alter table public.time_blocks       enable row level security;
alter table public.slot_types        enable row level security;
alter table public.user_settings     enable row level security;

-- ─────────────────────────────────────────────────────────
-- profiles  (users can read/update own profile)
-- ─────────────────────────────────────────────────────────
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
-- profiles INSERT is handled by the on_auth_user_created trigger (security definer)

-- ─────────────────────────────────────────────────────────
-- Generic owner-only policies for the rest
-- ─────────────────────────────────────────────────────────
-- workspaces
create policy "workspaces_select_own" on public.workspaces
  for select using (auth.uid() = user_id);
create policy "workspaces_insert_own" on public.workspaces
  for insert with check (auth.uid() = user_id);
create policy "workspaces_update_own" on public.workspaces
  for update using (auth.uid() = user_id);
create policy "workspaces_delete_own" on public.workspaces
  for delete using (auth.uid() = user_id);

-- categories
create policy "categories_select_own" on public.categories
  for select using (auth.uid() = user_id);
create policy "categories_insert_own" on public.categories
  for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on public.categories
  for update using (auth.uid() = user_id);
create policy "categories_delete_own" on public.categories
  for delete using (auth.uid() = user_id);

-- tasks
create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

-- journal_entries
create policy "journal_entries_select_own" on public.journal_entries
  for select using (auth.uid() = user_id);
create policy "journal_entries_insert_own" on public.journal_entries
  for insert with check (auth.uid() = user_id);
create policy "journal_entries_update_own" on public.journal_entries
  for update using (auth.uid() = user_id);
create policy "journal_entries_delete_own" on public.journal_entries
  for delete using (auth.uid() = user_id);

-- journal_photos
create policy "journal_photos_select_own" on public.journal_photos
  for select using (auth.uid() = user_id);
create policy "journal_photos_insert_own" on public.journal_photos
  for insert with check (auth.uid() = user_id);
create policy "journal_photos_update_own" on public.journal_photos
  for update using (auth.uid() = user_id);
create policy "journal_photos_delete_own" on public.journal_photos
  for delete using (auth.uid() = user_id);

-- scratchpad_items
create policy "scratchpad_items_select_own" on public.scratchpad_items
  for select using (auth.uid() = user_id);
create policy "scratchpad_items_insert_own" on public.scratchpad_items
  for insert with check (auth.uid() = user_id);
create policy "scratchpad_items_update_own" on public.scratchpad_items
  for update using (auth.uid() = user_id);
create policy "scratchpad_items_delete_own" on public.scratchpad_items
  for delete using (auth.uid() = user_id);

-- time_blocks
create policy "time_blocks_select_own" on public.time_blocks
  for select using (auth.uid() = user_id);
create policy "time_blocks_insert_own" on public.time_blocks
  for insert with check (auth.uid() = user_id);
create policy "time_blocks_update_own" on public.time_blocks
  for update using (auth.uid() = user_id);
create policy "time_blocks_delete_own" on public.time_blocks
  for delete using (auth.uid() = user_id);

-- slot_types
create policy "slot_types_select_own" on public.slot_types
  for select using (auth.uid() = user_id);
create policy "slot_types_insert_own" on public.slot_types
  for insert with check (auth.uid() = user_id);
create policy "slot_types_update_own" on public.slot_types
  for update using (auth.uid() = user_id);
create policy "slot_types_delete_own" on public.slot_types
  for delete using (auth.uid() = user_id);

-- user_settings
create policy "user_settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "user_settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id);
-- user_settings DELETE intentionally omitted (cascade from auth.users handles it)
