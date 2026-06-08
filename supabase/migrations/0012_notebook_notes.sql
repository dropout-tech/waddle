-- Notebook (記事本) — a Notion-style rich-text notes space, separate from the
-- daily scratchpad/白板. Unlike scratchpad_items (a per-day card grid of small
-- blocks), the notebook is a list of long-lived documents. Each note stores its
-- whole body as a single Tiptap/ProseMirror JSON document in `content`, so the
-- editor owns formatting (bold/italic/headings/lists/todo/toggle/quote) without
-- a per-block table or schema churn when new marks/nodes are added.

create table public.notebook_notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  icon text,                                   -- optional emoji shown in the list
  content jsonb,                               -- Tiptap/ProseMirror document JSON
  sort_order integer not null default 0,       -- manual order in the sidebar; gaps of 10
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()  -- maintained by the client on every save
);

-- Ordered sidebar fetch: active notes for a user, newest activity respected via
-- explicit sort_order (the client assigns index*10, leaving room to insert).
create index notebook_notes_user_sort_idx
  on public.notebook_notes(user_id, is_archived, sort_order);

-- RLS: owner-only, mirroring every other user-scoped table (see 0002).
alter table public.notebook_notes enable row level security;

create policy "notebook_notes_select_own" on public.notebook_notes
  for select using (auth.uid() = user_id);
create policy "notebook_notes_insert_own" on public.notebook_notes
  for insert with check (auth.uid() = user_id);
create policy "notebook_notes_update_own" on public.notebook_notes
  for update using (auth.uid() = user_id);
create policy "notebook_notes_delete_own" on public.notebook_notes
  for delete using (auth.uid() = user_id);

comment on table  public.notebook_notes         is 'Notion-style notebook documents (記事本); body is a Tiptap JSON doc.';
comment on column public.notebook_notes.content is 'Tiptap/ProseMirror document JSON (nodes: heading/paragraph/bulletList/orderedList/taskList/details/blockquote; marks: bold/italic/underline/strike/code/link).';
comment on column public.notebook_notes.icon    is 'Optional leading emoji for the note in the sidebar list.';
comment on column public.notebook_notes.sort_order is 'Manual sidebar ordering within a user; gaps of 10 for cheap inserts.';
