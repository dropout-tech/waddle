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
  /** Migration 0008 — optional in case the column hasn't shipped yet. */
  is_meeting?: boolean
  attendees?: string | null
  location?: string | null
  meeting_url?: string | null
  exdates?: string[] | null
  parent_id?: string | null
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
  type: 'text' | 'image' | 'link' | 'todo'
  content: string
  title: string | null
  is_checked: boolean | null
  sort_order: number | null
  parent_id: string | null
  metadata: Json | null
  created_at: string
}

type NotebookNotesRow = {
  id: string
  user_id: string
  title: string
  icon: string | null
  content: Json | null
  category_id: string | null
  sort_order: number
  is_archived: boolean
  created_at: string
  updated_at: string
}

type NotebookCategoriesRow = {
  id: string
  user_id: string
  name: string
  color: string
  icon: string | null
  sort_order: number
  is_archived: boolean
  created_at: string
  updated_at: string
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

// Migration 0016 — calendar sharing between accounts. Cross-account reads
// happen only through the RPCs below (Functions section); these table types
// cover the client's own direct reads/writes: inviter reads/revokes their own
// invites, either member reads/deletes a share, both members read grants.
type CalendarShareInvitesRow = {
  id: string
  inviter_id: string
  token_hash: string
  created_at: string
  expires_at: string
  accepted_by: string | null
  accepted_at: string | null
  revoked_at: string | null
}

type CalendarShareInvitesInsert = {
  id?: string
  inviter_id: string
  token_hash: string
  expires_at?: string
  accepted_by?: string | null
  accepted_at?: string | null
  revoked_at?: string | null
}

type CalendarSharesRow = {
  id: string
  user_lo: string
  user_hi: string
  invite_id: string | null
  created_at: string
}

type CalendarSharesInsert = {
  id?: string
  user_lo: string
  user_hi: string
  invite_id?: string | null
}

// `ref` is TEXT (workspaces.id::text or slot_types.key), not uuid — see
// migration 0016 comment on this table for why.
type CalendarShareGrantsRow = {
  share_id: string
  owner_id: string
  kind: 'workspace' | 'slot_type'
  ref: string
  detail: 'full' | 'busy'
  created_at: string
}

type CalendarShareGrantsInsert = {
  share_id: string
  owner_id: string
  kind: 'workspace' | 'slot_type'
  ref: string
  detail: 'full' | 'busy'
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
  /** Migration 0007 — optional in case the column hasn't shipped yet. */
  keep_completed_today_in_list?: boolean
  /** Migration 0009 — optional in case the column hasn't shipped yet. */
  quick_links?: Json
  /** Migration 0013 — optional in case the column hasn't shipped yet. */
  show_category_prefix?: boolean
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

type GrowthDaysRow = {
  id: string
  user_id: string
  activity_date: string
  planned_count: number
  completed_count: number
  focus_minutes: number
  reflection_count: number
  footprint_earned: boolean
  created_at: string
  updated_at: string
}

type GrowthAchievementsRow = {
  user_id: string
  achievement_key: string
  unlocked_at: string
  progress: number
  metadata: Json
}

type GrowthJourneysRow = {
  id: string
  user_id: string
  title: string
  daily_step: string
  duration_days: 7 | 14 | 30
  start_date: string
  status: 'active' | 'completed' | 'paused'
  completed_at: string | null
  created_at: string
  updated_at: string
}

type GrowthJourneyDaysRow = {
  id: string
  journey_id: string
  user_id: string
  entry_date: string
  is_complete: boolean
  note: string | null
  completed_at: string | null
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
  is_meeting?: boolean
  attendees?: string | null
  location?: string | null
  meeting_url?: string | null
  exdates?: string[] | null
  parent_id?: string | null
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
  type: 'text' | 'image' | 'link' | 'todo'
  content: string
  title?: string | null
  is_checked?: boolean | null
  sort_order?: number | null
  parent_id?: string | null
  metadata?: Json | null
}

type NotebookNotesInsert = {
  id?: string
  user_id: string
  title?: string
  icon?: string | null
  content?: Json | null
  category_id?: string | null
  sort_order?: number
  is_archived?: boolean
  updated_at?: string
}

type NotebookCategoriesInsert = {
  id?: string
  user_id: string
  name?: string
  color?: string
  icon?: string | null
  sort_order?: number
  is_archived?: boolean
  updated_at?: string
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
  keep_completed_today_in_list?: boolean
  quick_links?: Json
  show_category_prefix?: boolean
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

type GrowthDaysInsert = {
  id?: string
  user_id: string
  activity_date: string
  planned_count?: number
  completed_count?: number
  focus_minutes?: number
  reflection_count?: number
  footprint_earned?: boolean
  updated_at?: string
}

type GrowthAchievementsInsert = {
  user_id: string
  achievement_key: string
  unlocked_at?: string
  progress?: number
  metadata?: Json
}

type GrowthJourneysInsert = {
  id?: string
  user_id: string
  title: string
  daily_step: string
  duration_days: 7 | 14 | 30
  start_date: string
  status?: 'active' | 'completed' | 'paused'
  completed_at?: string | null
  updated_at?: string
}

type GrowthJourneyDaysInsert = {
  id?: string
  journey_id: string
  user_id: string
  entry_date: string
  is_complete?: boolean
  note?: string | null
  completed_at?: string | null
  updated_at?: string
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
      notebook_notes: Tbl<NotebookNotesRow, NotebookNotesInsert>
      notebook_categories: Tbl<NotebookCategoriesRow, NotebookCategoriesInsert>
      time_blocks: Tbl<TimeBlocksRow, TimeBlocksInsert>
      slot_types: Tbl<SlotTypesRow, SlotTypesInsert>
      user_settings: Tbl<UserSettingsRow, UserSettingsInsert>
      calendar_share_invites: Tbl<CalendarShareInvitesRow, CalendarShareInvitesInsert>
      calendar_shares: Tbl<CalendarSharesRow, CalendarSharesInsert>
      calendar_share_grants: Tbl<CalendarShareGrantsRow, CalendarShareGrantsInsert>
      growth_days: Tbl<GrowthDaysRow, GrowthDaysInsert>
      growth_achievements: Tbl<GrowthAchievementsRow, GrowthAchievementsInsert>
      growth_journeys: Tbl<GrowthJourneysRow, GrowthJourneysInsert>
      growth_journey_days: Tbl<GrowthJourneyDaysRow, GrowthJourneyDaysInsert>
    }
    Views: Record<string, never>
    // Migration 0016's five RPCs — the only path for cross-account reads.
    // Hand-written (supabase gen would rewrite this whole file); keep in sync
    // with supabase/migrations/0016_calendar_sharing.sql if it changes.
    Functions: {
      create_share_invite: {
        Args: Record<PropertyKey, never>
        /** Raw invite token, returned exactly once (only its hash is stored). */
        Returns: string
      }
      preview_share_invite: {
        Args: { p_token: string }
        Returns: {
          display_name: string | null
          avatar_url: string | null
        }[]
      }
      accept_share_invite: {
        Args: { p_token: string }
        /** New (or already-existing) calendar_shares.id for the pair. */
        Returns: string
      }
      get_share_peers: {
        Args: Record<PropertyKey, never>
        Returns: {
          share_id: string
          peer_id: string
          display_name: string | null
          avatar_url: string | null
          created_at: string
        }[]
      }
      get_shared_calendar: {
        Args: { p_peer: string; p_from: string; p_to: string }
        Returns: {
          source: 'task' | 'time_block'
          id: string
          event_date: string
          start_time: string
          end_time: string
          type_key: string | null
          color: string
          detail: 'full' | 'busy'
          title: string | null
          is_recurring: boolean
          recurrence_type: string | null
          recurrence_interval: number | null
          recurrence_days_of_week: number[] | null
          recurrence_end_date: string | null
          exdates: Json | null
          parent_id: string | null
        }[]
      }
    }
    Enums: {
      task_type_enum: 'one_time' | 'routine' | 'project'
      recurrence_type_enum: 'daily' | 'weekly' | 'monthly' | 'custom'
      mood_enum: 'great' | 'good' | 'neutral' | 'bad' | 'terrible'
      icon_type_enum: 'lucide' | 'custom' | 'emoji'
    }
    CompositeTypes: Record<string, never>
  }
}
