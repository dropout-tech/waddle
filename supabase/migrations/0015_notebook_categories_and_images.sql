-- Notebook enhancements: dedicated categories (folder-style, one level),
-- a nullable category link on notes, and a Storage bucket for inline images.
--
-- Categories are *notebook-only* (deliberately separate from the task
-- workspace/category tables): notes organise differently from tasks, and
-- coupling them would entangle two schemas that evolve independently.

-- ── 1. Notebook categories (a flat list of folders per user) ──────────────
create table public.notebook_categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  color text not null default 'oklch(0.62 0.08 250)',  -- sidebar dot/label tint
  icon text,                                            -- optional leading emoji
  sort_order integer not null default 0,                -- manual order; gaps of 10
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notebook_categories_user_sort_idx
  on public.notebook_categories(user_id, is_archived, sort_order);

alter table public.notebook_categories enable row level security;

create policy "notebook_categories_select_own" on public.notebook_categories
  for select using (auth.uid() = user_id);
create policy "notebook_categories_insert_own" on public.notebook_categories
  for insert with check (auth.uid() = user_id);
create policy "notebook_categories_update_own" on public.notebook_categories
  for update using (auth.uid() = user_id);
create policy "notebook_categories_delete_own" on public.notebook_categories
  for delete using (auth.uid() = user_id);

comment on table public.notebook_categories is 'Notebook-only folders (記事本分類); independent of task workspaces/categories.';

-- ── 2. Link notes to a category (null = 未分類 / Uncategorised) ────────────
-- ON DELETE SET NULL: removing a folder never deletes its notes — they fall
-- back to the "未分類" bucket instead.
alter table public.notebook_notes
  add column category_id uuid references public.notebook_categories(id) on delete set null;

create index notebook_notes_category_idx
  on public.notebook_notes(user_id, category_id, sort_order);

comment on column public.notebook_notes.category_id is 'Optional notebook_categories FK; null means 未分類.';

-- ── 3. Storage bucket for inline note images ──────────────────────────────
-- Public bucket, but object paths are user-scoped and unguessable
-- ({user_id}/{uuid}.{ext}): URLs never expire (so a saved note never shows a
-- broken image), while the insert/update/delete policies below still ensure a
-- user can only write under their own {user_id}/ prefix.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notebook-images',
  'notebook-images',
  true,
  5242880,  -- 5 MB
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

create policy "notebook_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'notebook-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "notebook_images_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'notebook-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "notebook_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'notebook-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
