-- Sticky notes (便條紙) — a glass-pane layer of freeform notes that floats
-- above every authenticated page (task board, calendar, notebook, meetings…),
-- like paper stuck to the screen. One shared set per user, positioned by
-- viewport-relative percentage so it never runs off-screen when the window
-- resizes. Content reuses the notebook's Tiptap/ProseMirror JSON shape (see
-- 0012_notebook_notes.sql) rather than inventing a second text format.

create table public.sticky_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content jsonb,                                -- Tiptap/ProseMirror document JSON; null = empty note
  x real not null default 40,                   -- left edge, % of viewport width (0-100)
  y real not null default 20,                   -- top edge, % of viewport height (0-100)
  width integer not null default 260,           -- px
  height integer not null default 220,          -- px
  color text not null default 'yellow',         -- 'yellow' | 'sage' | 'rose' | 'cream'
  z_index integer not null default 0,           -- local stacking order; bumped on focus/drag
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()  -- maintained by the client on every save
);

create index sticky_notes_user_idx on public.sticky_notes(user_id);

-- RLS: owner-only, mirroring every other user-scoped table (see 0002, 0012).
alter table public.sticky_notes enable row level security;

create policy "sticky_notes_select_own" on public.sticky_notes
  for select using (auth.uid() = user_id);
create policy "sticky_notes_insert_own" on public.sticky_notes
  for insert with check (auth.uid() = user_id);
create policy "sticky_notes_update_own" on public.sticky_notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sticky_notes_delete_own" on public.sticky_notes
  for delete using (auth.uid() = user_id);

comment on table  public.sticky_notes        is 'Freeform sticky notes shown as a glass overlay on every page (便條紙); body is a Tiptap JSON doc, same shape as notebook_notes.content.';
comment on column public.sticky_notes.content is 'Tiptap/ProseMirror document JSON (subset: paragraph/bold/italic/underline/strike/bulletList/orderedList/taskList).';
comment on column public.sticky_notes.x       is 'Left edge as % of viewport width (0-100); recomputed to px client-side so notes stay on-screen across window sizes.';
comment on column public.sticky_notes.y       is 'Top edge as % of viewport height (0-100).';
comment on column public.sticky_notes.z_index is 'Local stacking order among a user''s own notes; bumped to max+1 whenever a note is dragged/focused.';
