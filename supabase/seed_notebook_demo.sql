-- Demo seed for the notebook (記事本). Run this in the Supabase SQL editor
-- AFTER applying migration 0012_notebook_notes.sql.
--
-- It inserts one note (達宇正式環境上線) as a Tiptap/ProseMirror document with a
-- checkable task list, owned by the user matched on email below. The SQL editor
-- runs as a privileged role, so RLS is bypassed and the explicit user_id sticks.
--
-- ▸ Change the email if this isn't the right account.

insert into public.notebook_notes (user_id, title, icon, content, sort_order)
select
  u.id,
  '達宇正式環境上線',
  '🧾',
  '{
    "type": "doc",
    "content": [
      { "type": "paragraph", "content": [{ "type": "text", "text": "完成下面三件事：" }] },
      {
        "type": "taskList",
        "content": [
          { "type": "taskItem", "attrs": { "checked": false }, "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "簽達宇合約 + 用印" }] } ] },
          { "type": "taskItem", "attrs": { "checked": false }, "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "匯款 NT$7,200（年費）" }] } ] },
          { "type": "taskItem", "attrs": { "checked": false }, "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "達宇核發正式環境的 ShopID + HashKey（會是不同的一組）" }] } ] },
          { "type": "taskItem", "attrs": { "checked": false }, "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "切換 Vercel 環境變數 UIC_ENV=production + 填正式帳號" }] } ] }
        ]
      }
    ]
  }'::jsonb,
  0
from auth.users u
where u.email = 'lazydragon0247@gmail.com';
