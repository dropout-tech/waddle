import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * The widget → app queue. Native widget buttons (ios/App/HuddleWidgets) never
 * touch the server: they append one of these to the App Group store
 * (WidgetStore.swift), and the app replays them here the next time it runs,
 * then acknowledges the handled ids so they leave the queue.
 */
export type FocusOp = 'start' | 'pause' | 'resume' | 'stop'
interface ActionBase { id: string; accountId: string; epoch: string }
/** `type`/`completed` absent = the original complete-only shape (older widget builds). */
export interface TaskAction extends ActionBase { type?: 'task'; taskId: string; revision: string; completed?: boolean }
export interface WaterAction extends ActionBase { type: 'water'; at: number }
export interface FocusAction extends ActionBase { type: 'focus'; op: FocusOp; at: number }
export type WidgetAction = TaskAction | WaterAction | FocusAction

export interface WidgetActionDeps {
  db: Pick<SupabaseClient<Database>, 'from'>
  source: string
  epoch: string
  /** False once the account / epoch changed or the component unmounted: stop immediately. */
  isCurrent: () => boolean
  /** Apply one timer tap at its original time; the timer ignores taps that don't fit its state. */
  focus: (op: FocusOp, at: number) => void
  water: (at: number) => void
  notify: (message: string) => void
  now?: () => number
}

const FOCUS_OPS: readonly FocusOp[] = ['start', 'pause', 'resume', 'stop']

/**
 * Replays the queue in order and returns the ids that are done with (applied,
 * or stale and dropped). Only the first focus tap is applied per pass: each
 * one changes React timer state that the next one must see, so the rest wait
 * for the re-render-triggered next sync.
 */
export async function applyWidgetActions(actions: WidgetAction[], deps: WidgetActionDeps): Promise<{ handled: string[]; aborted: boolean }> {
  const { db, source, epoch } = deps
  const now = deps.now ?? Date.now
  const handled: string[] = []
  let focusApplied = false
  // Times come from the phone's clock inside the widget; never trust one from the future.
  const when = (at: unknown) => typeof at === 'number' && Number.isFinite(at) ? Math.min(at, now()) : null
  for (const action of actions) {
    if (!deps.isCurrent()) return { handled, aborted: true }
    if (action.accountId !== source || action.epoch !== epoch) continue
    if (action.type === 'water') {
      const at = when(action.at)
      if (at !== null) deps.water(at)
      handled.push(action.id)
      continue
    }
    if (action.type === 'focus') {
      if (focusApplied) continue
      const at = when(action.at)
      if (at !== null && FOCUS_OPS.includes(action.op)) { deps.focus(action.op, at); focusApplied = true }
      handled.push(action.id)
      continue
    }
    if (action.type !== undefined && action.type !== 'task') { handled.push((action as ActionBase).id); continue }
    const target = action.completed ?? true
    // Explicit SET to the target, never a toggle: a retry after a crash cannot flip it back.
    const { data: current, error: readError } = await db.from('tasks').select('id,is_completed,updated_at,is_recurring,is_archived').eq('id', action.taskId).eq('user_id', source).maybeSingle()
    if (!deps.isCurrent()) return { handled, aborted: true }
    if (readError) continue
    if (!current || current.is_archived || current.is_recurring || current.updated_at !== action.revision) {
      handled.push(action.id)
      if (current?.is_completed !== target) deps.notify('小工具任務已變更，請在 App 確認最新內容')
      continue
    }
    if (current.is_completed === target) { handled.push(action.id); continue }
    const { data, error } = await db.from('tasks').update({ is_completed: target, completed_at: target ? new Date(now()).toISOString() : null }).eq('id', action.taskId).eq('user_id', source).eq('updated_at', action.revision).select('id')
    if (!error && data?.length) handled.push(action.id)
  }
  return { handled, aborted: false }
}
