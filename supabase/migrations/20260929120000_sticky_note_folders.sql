-- Sticky-note folders (便條紙資料夾) + "put away" state. A note can be taken
-- off the screen without deleting it (on_screen = false), filed into one of
-- the user's own sticky-note folders, and pinned back later from the drawer
-- next to the 便條紙 toolbar button. Folders are separate from the
-- notebook's notebook_categories on purpose (product decision 2026-09-29).

create table public.sticky_note_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index sticky_note_folders_user_idx on public.sticky_note_folders(user_id);

alter table public.sticky_note_folders enable row level security;

create policy "sticky_note_folders_select_own" on public.sticky_note_folders
  for select using (auth.uid() = user_id);
create policy "sticky_note_folders_insert_own" on public.sticky_note_folders
  for insert with check (auth.uid() = user_id);
create policy "sticky_note_folders_update_own" on public.sticky_note_folders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sticky_note_folders_delete_own" on public.sticky_note_folders
  for delete using (auth.uid() = user_id);

-- Deleting a folder never deletes notes: they fall back to 未分類 (null).
alter table public.sticky_notes
  add column folder_id uuid references public.sticky_note_folders(id) on delete set null,
  add column on_screen boolean not null default true;

create index sticky_notes_folder_idx on public.sticky_notes(folder_id);

comment on table  public.sticky_note_folders    is 'User-owned folders for put-away sticky notes (便條紙資料夾); independent of notebook_categories.';
comment on column public.sticky_notes.folder_id is 'sticky_note_folders FK; null = 未分類. Kept while the note is on screen so re-stowing returns it to the same folder.';
comment on column public.sticky_notes.on_screen is 'true = pinned on the glass overlay; false = put away in the drawer (not deleted).';
