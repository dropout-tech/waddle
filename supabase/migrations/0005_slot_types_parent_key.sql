-- Custom slot types can hang off synthetic parents (built-in 時間區塊 with
-- key='timeblock', or per-workspace pseudo-types keyed `ws-<uuid>`). Those
-- parents don't exist as rows in slot_types, so we can't store them in the
-- existing uuid+FK `parent_id` column. Add a free-form text companion that
-- holds whatever string ID the app uses for the parent at runtime.

alter table public.slot_types
  add column if not exists parent_key text;
