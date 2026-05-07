// Database types matching supabase/migrations/0001_initial_schema.sql.
// Regenerate from your Supabase project with:
//   npx supabase gen types typescript --project-id <YOUR_PROJECT_ID> > lib/supabase/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─────────────────────────────────────────────────────────
// Row types — what comes back from SELECT (all NOT NULL columns required,
// nullable columns explicit `| null`).
// ─────────────────────────────────────────────────────────

type ProfilesRow = {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

type WorkspacesRow = {
  id: string
  user_id: string
  name: string
  color: string
  icon: string
  sort_order: number
  is_archived: boolean
  created_at: string
  updated_at: string
}

type CategoriesRow = {
  id: string
  workspace_id: string
  user_id: string
  name: string
  sort_order: number
  is_collapsed: boolean
  is_archived: boolean
  created_at: string
  updated_at: string
}

type TasksRow = {
  id: string
  user_id: string
  workspace_id: string
  category_id: string
  title: string
  description: string | null
  task_type: 'one_time' | 'routine' | 'project'
  urgency: number
  estimated_minutes: number | null
  actual_minutes: number | null
  due_date: string | null
  scheduled_date: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  calendar_color: string
  is_completed: boolean
  completed_at: string | null
  is_archived: boolean
  archived_at: string | null
  notes: string | null
  sort_order: number
  is_recurring: boolean
  recurrence_type: 'daily' | 'weekly' | 'monthly' | 'custom' | null
  recurrence_interval: number | null
  recurrence_days_of_week: number[] | null
  recurrence_end_date: string | null
  google_event_id: string | null
  show_in_task_list: boolean
  created_at: string
  updated_at: string
}

type JournalEntriesRow = {
  id: string
  user_id: string
  date: string
  content: string | null
  mood: 'great' | 'good' | 'neutral' | 'bad' | 'terrible' | null
  created_at: string
  updated_at: string
}

type JournalPhotosRow = {
  id: string
  journal_id: string
  user_id: string
  url: string
  caption: string | null
  sort_order: number
  created_at: string
}

type ScratchpadItemsRow = {
  id: string
  user_id: string
  date: string
  type: 'text' | 'image' | 'link'
  content: string
  title: string | null
  created_at: string
}

type TimeBlocksRow = {
  id: string
  user_id: string
  date: string
  start_time: string
  end_time: string
  type: string
  label: string
  color: string
  is_recurring: boolean
  recurrence_rule: string | null
  created_at: string
  updated_at: string
}

type SlotTypesRow = {
  id: string
  user_id: string
  key: string
  label: string
  description: string
  icon: string
  icon_type: 'lucide' | 'custom' | 'emoji'
  color: string
  parent_id: string | null
  parent_key: string | null
  workspace_id: string | null
  sort_order: number
  is_built_in: boolean
  created_at: string
}

type UserSettingsRow = {
  user_id: string
  calendar_start_hour: number
  calendar_end_hour: number
  default_view: 'day' | 'week' | 'month'
  week_start_day: number
  /** Migration 0006 — optional in case the column hasn't shipped yet. */
  day_view_days?: number
  /** Migration 0006 — optional in case the column hasn't shipped yet. */
  week_view_days?: number
  weather_city: string
  weather_unit: 'celsius' | 'fahrenheit'
  lunch_break: Json
  buffer_time: Json
  default_task_colors: Json
  notifications: Json
  google_calendar_connected: boolean
  google_calendar_sync_ids: string[]
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────
// Insert types — what we send to INSERT. Most defaults filled by DB so we
// allow them as optional. Required: only columns without DB defaults.
// ─────────────────────────────────────────────────────────

type ProfilesInsert = {
  id: string
  display_name?: string | null
  avatar_url?: string | null
}

type WorkspacesInsert = {
  id?: string
  user_id: string
  name: string
  color: string
  icon: string
  sort_order?: number
  is_archived?: boolean
}

type CategoriesInsert = {
  id?: string
  workspace_id: string
  user_id: string
  name: string
  sort_order?: number
  is_collapsed?: boolean
  is_archived?: boolean
}

type TasksInsert = {
  id?: string
  user_id: string
  workspace_id: string
  category_id: string
  title: string
  description?: string | null
  task_type?: 'one_time' | 'routine' | 'project'
  urgency?: number
  estimated_minutes?: number | null
  actual_minutes?: number | null
  due_date?: string | null
  scheduled_date?: string | null
  scheduled_start_time?: string | null
  scheduled_end_time?: string | null
  calendar_color?: string
  is_completed?: boolean
  completed_at?: string | null
  is_archived?: boolean
  archived_at?: string | null
  notes?: string | null
  sort_order?: number
  is_recurring?: boolean
  recurrence_type?: 'daily' | 'weekly' | 'monthly' | 'custom' | null
  recurrence_interval?: number | null
  recurrence_days_of_week?: number[] | null
  recurrence_end_date?: string | null
  google_event_id?: string | null
  show_in_task_list?: boolean
}

type JournalEntriesInsert = {
  id?: string
  user_id: string
  date: string
  content?: string | null
  mood?: 'great' | 'good' | 'neutral' | 'bad' | 'terrible' | null
}

type JournalPhotosInsert = {
  id?: string
  journal_id: string
  user_id: string
  url: string
  caption?: string | null
  sort_order?: number
}

type ScratchpadItemsInsert = {
  id?: string
  user_id: string
  date: string
  type: 'text' | 'image' | 'link'
  content: string
  title?: string | null
}

type TimeBlocksInsert = {
  id?: string
  user_id: string
  date: string
  start_time: string
  end_time: string
  type: string
  label: string
  color: string
  is_recurring?: boolean
  recurrence_rule?: string | null
}

type SlotTypesInsert = {
  id?: string
  user_id: string
  key: string
  label: string
  description?: string
  icon: string
  icon_type?: 'lucide' | 'custom' | 'emoji'
  color: string
  parent_id?: string | null
  parent_key?: string | null
  workspace_id?: string | null
  sort_order?: number
  is_built_in?: boolean
}

type UserSettingsInsert = {
  user_id: string
  calendar_start_hour?: number
  calendar_end_hour?: number
  default_view?: 'day' | 'week' | 'month'
  week_start_day?: number
  day_view_days?: number
  week_view_days?: number
  weather_city?: string
  weather_unit?: 'celsius' | 'fahrenheit'
  lunch_break?: Json
  buffer_time?: Json
  default_task_colors?: Json
  notifications?: Json
  google_calendar_connected?: boolean
  google_calendar_sync_ids?: string[]
  onboarding_completed?: boolean
}

// ─────────────────────────────────────────────────────────
// Database type composition
// ─────────────────────────────────────────────────────────

type Tbl<R, I> = {
  Row: R
  Insert: I
  Update: Partial<I>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: Tbl<ProfilesRow, ProfilesInsert>
      workspaces: Tbl<WorkspacesRow, WorkspacesInsert>
      categories: Tbl<CategoriesRow, CategoriesInsert>
      tasks: Tbl<TasksRow, TasksInsert>
      journal_entries: Tbl<JournalEntriesRow, JournalEntriesInsert>
      journal_photos: Tbl<JournalPhotosRow, JournalPhotosInsert>
      scratchpad_items: Tbl<ScratchpadItemsRow, ScratchpadItemsInsert>
      time_blocks: Tbl<TimeBlocksRow, TimeBlocksInsert>
      slot_types: Tbl<SlotTypesRow, SlotTypesInsert>
      user_settings: Tbl<UserSettingsRow, UserSettingsInsert>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      task_type_enum: 'one_time' | 'routine' | 'project'
      recurrence_type_enum: 'daily' | 'weekly' | 'monthly' | 'custom'
      mood_enum: 'great' | 'good' | 'neutral' | 'bad' | 'terrible'
      scratchpad_type_enum: 'text' | 'image' | 'link'
      icon_type_enum: 'lucide' | 'custom' | 'emoji'
    }
    CompositeTypes: Record<string, never>
  }
}
