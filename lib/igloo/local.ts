/**
 * Per-device, per-account igloo memory (localStorage). Everything here is a
 * convenience on top of the pure maths in ./compute:
 *  - `tasks`: completed tasks already turned into bricks (id → completedAt),
 *    so a brick stays even if its task is later deleted or un-completed;
 *  - `focus`: finished pomodoros per local day (lib/pomodoro-count.ts only
 *    remembers today, so we keep the history here);
 *  - `seen`: how many bricks the user has already watched go up — the
 *    difference is replayed as 「你不在的時候，我幫你搬了 N 塊」.
 * If storage is unavailable the igloo still works from live data alone.
 */
import type { IglooFocusLog, IglooTaskInput } from './compute'

const PREFIX = 'huddle-igloo-v1'

export interface IglooLocal {
  tasks: Record<string, string>
  focus: IglooFocusLog
  seen?: number
}

const keyFor = (userId: string) => `${PREFIX}:${userId}`

export function readIglooLocal(userId: string): IglooLocal {
  try {
    const raw = window.localStorage.getItem(keyFor(userId))
    const parsed = raw ? (JSON.parse(raw) as Partial<IglooLocal>) : {}
    return {
      tasks: parsed.tasks && typeof parsed.tasks === 'object' ? parsed.tasks : {},
      focus: parsed.focus && typeof parsed.focus === 'object' ? parsed.focus : {},
      ...(typeof parsed.seen === 'number' ? { seen: parsed.seen } : {}),
    }
  } catch {
    return { tasks: {}, focus: {} }
  }
}

export function writeIglooLocal(userId: string, next: IglooLocal): void {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(next))
  } catch {
    /* storage full / blocked — the igloo just won't remember */
  }
}

/**
 * Merge today's live data into the ledger. Returns the merged ledger and
 * whether anything changed (so callers only write when needed).
 */
export function mergeIglooLedger(
  prev: IglooLocal,
  liveDone: readonly IglooTaskInput[],
  focusToday: { date: string; count: number },
): { next: IglooLocal; changed: boolean } {
  let changed = false
  const tasks = { ...prev.tasks }
  for (const t of liveDone) {
    if (t.isCompleted === false) continue
    const at = t.completedAt ?? ''
    if (!(t.id in tasks) || (!tasks[t.id] && at)) {
      tasks[t.id] = at
      changed = true
    }
  }
  const focus = { ...prev.focus }
  if (focusToday.count > (focus[focusToday.date] ?? 0)) {
    focus[focusToday.date] = focusToday.count
    changed = true
  }
  return { next: { ...prev, tasks, focus }, changed }
}

export function ledgerTasks(local: IglooLocal): IglooTaskInput[] {
  return Object.entries(local.tasks).map(([id, at]) => ({ id, completedAt: at || null }))
}
