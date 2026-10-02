// 「自動」settings (migration 20261002110000): null means "behave exactly as
// the app did before these settings took effect" (origin/main 62574cf):
//   預設視圖     null → desktop opens 日, phones open 週 (owner, 2026-09-26)
//   每週開始日   null → month grid starts on Sunday; the week view starts at
//                       the selected date and rolls forward (no week alignment)
//   預設任務時長 null → a click on an empty slot creates a 30-minute task
// A value the user picked is used as-is, on every device.
//
// Before that migration is applied the columns are NOT NULL and every
// untouched row still holds the old DB defaults ('week' / 1); there is no
// default_task_minutes column at all. Rows without that column are read in
// legacy mode: the old defaults mean 自動, and saving writes them back for
// 自動 (null would violate NOT NULL). So both deploy orders work.
//
// Pure module (type-only imports) so node --test can load it.

export type ViewMode = 'day' | 'week' | 'month'

export const AUTO_TASK_MINUTES = 30
export const MIN_TASK_MINUTES = 15
export const MAX_TASK_MINUTES = 240

/** Old DB defaults (0001_initial_schema.sql) that nobody chose on purpose. */
export const LEGACY_DEFAULT_VIEW = 'week'
export const LEGACY_WEEK_START_DAY = 1

export function resolveDefaultView(pref: ViewMode | null | undefined, isMobile: boolean): ViewMode {
  if (pref === 'day' || pref === 'week' || pref === 'month') return pref
  return isMobile ? 'week' : 'day'
}

/** First weekday of the month grid (0 = Sunday). */
export function monthGridStartDay(pref: number | null | undefined): number {
  return isWeekday(pref) ? pref : 0
}

/** Whether the desktop week view snaps to the start of the week (only when
 *  the user picked a start day; 自動 keeps "selected date first"). */
export function weekViewAlignDay(pref: number | null | undefined): number | null {
  return isWeekday(pref) ? pref : null
}

export function resolveTaskMinutes(pref: number | null | undefined): number {
  return isTaskMinutes(pref) ? Math.round(pref) : AUTO_TASK_MINUTES
}

function isWeekday(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6
}

function isTaskMinutes(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= MIN_TASK_MINUTES && v <= MAX_TASK_MINUTES
}

export interface AutoPrefs {
  defaultView: ViewMode | null
  weekStartDay: number | null
  defaultTaskMinutes: number | null
  /** The DB has the nullable columns (migration applied). */
  autoColumns: boolean
}

/** user_settings row → preferences (null = 自動), for either schema. */
export function prefsFromRow(row: Record<string, unknown>): AutoPrefs {
  const autoColumns = 'default_task_minutes' in row
  const view = row.default_view
  const week = row.week_start_day
  return {
    defaultView:
      view === 'day' || view === 'week' || view === 'month'
        ? !autoColumns && view === LEGACY_DEFAULT_VIEW ? null : view
        : null,
    weekStartDay: isWeekday(week) ? (!autoColumns && week === LEGACY_WEEK_START_DAY ? null : week) : null,
    defaultTaskMinutes: autoColumns && isTaskMinutes(row.default_task_minutes) ? Math.round(row.default_task_minutes) : null,
    autoColumns,
  }
}

/** Preferences → the user_settings columns to write, for either schema. */
export function prefsToRow(p: AutoPrefs): {
  default_view: ViewMode | null
  week_start_day: number | null
  default_task_minutes?: number | null
} {
  if (!p.autoColumns) {
    // Legacy schema: NOT NULL columns, no minutes column. 自動 is stored as
    // the old default (read back as 自動); an explicit minutes value can't be
    // stored until the migration is applied.
    return {
      default_view: p.defaultView ?? LEGACY_DEFAULT_VIEW,
      week_start_day: p.weekStartDay ?? LEGACY_WEEK_START_DAY,
    }
  }
  return {
    default_view: p.defaultView,
    week_start_day: p.weekStartDay,
    default_task_minutes: p.defaultTaskMinutes,
  }
}
