/**
 * Per-device, per-account igloo memory (localStorage). Everything here is a
 * convenience on top of the pure maths in ./compute:
 *  - `tasks`: completed tasks already turned into bricks (id → completedAt),
 *    so a brick stays even if its task is later deleted or un-completed;
 *  - `focus`: finished pomodoros per local day credited to THIS account
 *    (lib/pomodoro-count.ts keeps one counter per device and only for today);
 *  - `focusSeen`: the device counter the last time this account looked, so
 *    only pomodoros finished while this account was the one signed in count;
 *  - `seen`: how many bricks the user has already watched go up — the
 *    difference is replayed as 「你不在的時候，我幫你搬了 N 塊」.
 * A device-wide `…:active` key remembers which account used the device last;
 * when another account signs in, counting restarts from the counter's
 * current value (nothing done by the other account is credited).
 * If storage is unavailable the igloo still works from live data alone.
 *
 * The functions below the storage helpers are pure (node-testable).
 */
import type { IglooFocusLog, IglooTaskInput } from './compute'

const PREFIX = 'huddle-igloo-v1'
const ACTIVE_KEY = `${PREFIX}:active`

export interface FocusCount {
  date: string
  count: number
}

export interface IglooLocal {
  tasks: Record<string, string>
  focus: IglooFocusLog
  focusSeen?: FocusCount
  seen?: number
}

export const iglooStorageKey = (userId: string) => `${PREFIX}:${userId}`

export function readIglooLocal(userId: string): IglooLocal {
  try {
    const raw = window.localStorage.getItem(iglooStorageKey(userId))
    const parsed = raw ? (JSON.parse(raw) as Partial<IglooLocal>) : {}
    const fs = parsed.focusSeen
    return {
      tasks: parsed.tasks && typeof parsed.tasks === 'object' ? parsed.tasks : {},
      focus: parsed.focus && typeof parsed.focus === 'object' ? parsed.focus : {},
      ...(fs && typeof fs.date === 'string' && typeof fs.count === 'number' ? { focusSeen: fs } : {}),
      ...(typeof parsed.seen === 'number' ? { seen: parsed.seen } : {}),
    }
  } catch {
    return { tasks: {}, focus: {} }
  }
}

export function writeIglooLocal(userId: string, next: IglooLocal): void {
  try {
    window.localStorage.setItem(iglooStorageKey(userId), JSON.stringify(next))
  } catch {
    /* storage full / blocked — the igloo just won't remember */
  }
}

/** Which account used this device last (null = never recorded). */
export function readActiveUser(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

export function writeActiveUser(userId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_KEY, userId)
  } catch {
    /* ignore */
  }
}

/**
 * One account's ledger, read from localStorage once and then kept in memory
 * (a tiny external store for useSyncExternalStore). `sync` merges the live
 * data in and writes back only when something actually changed.
 */
export function createIglooLedger(userId: string, deviceNow: FocusCount) {
  let data = startFocusCounting(readIglooLocal(userId), readActiveUser(), userId, deviceNow)
  const listeners = new Set<() => void>()
  return {
    get: () => data,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    sync(liveDone: readonly IglooTaskInput[], now: FocusCount) {
      const r = mergeIglooLedger(data, liveDone, now)
      if (!r.changed) return
      data = r.next
      // `seen` belongs to the dialog; keep whatever it last wrote.
      writeIglooLocal(userId, { ...data, seen: readIglooLocal(userId).seen })
      for (const l of listeners) l()
    },
  }
}

// ─── pure ─────────────────────────────────────────────────────────────

/**
 * Where this account's pomodoro counting starts when it becomes active.
 * Another account used the device since → start from the counter as it is
 * now (their pomodoros aren't ours). Same account (a reload) or the first
 * run on this device → carry on from what this account saw last.
 */
export function startFocusCounting(local: IglooLocal, lastActiveUser: string | null, userId: string, deviceNow: FocusCount): IglooLocal {
  if (lastActiveUser && lastActiveUser !== userId) return { ...local, focusSeen: deviceNow }
  return local
}

/**
 * Merge the live data into the ledger. Pure and idempotent (merging the same
 * data twice changes nothing): new completed tasks are added, and pomodoros
 * the device counted since `prev.focusSeen` are credited to this account.
 */
export function mergeIglooLedger(
  prev: IglooLocal,
  liveDone: readonly IglooTaskInput[],
  deviceNow: FocusCount,
): { next: IglooLocal; changed: boolean } {
  let changed = false
  let tasks = prev.tasks
  for (const t of liveDone) {
    if (t.isCompleted === false) continue
    const at = t.completedAt ?? ''
    if (!(t.id in tasks) || (!tasks[t.id] && at)) {
      if (tasks === prev.tasks) tasks = { ...prev.tasks }
      tasks[t.id] = at
      changed = true
    }
  }
  let focus = prev.focus
  const from = prev.focusSeen && prev.focusSeen.date === deviceNow.date ? prev.focusSeen.count : 0
  const gained = deviceNow.count - from
  if (gained > 0) {
    focus = { ...prev.focus, [deviceNow.date]: (prev.focus[deviceNow.date] ?? 0) + gained }
    changed = true
  }
  const seenChanged = !prev.focusSeen || prev.focusSeen.date !== deviceNow.date || prev.focusSeen.count !== deviceNow.count
  // The counter going down (another tab reset it, a new day) only moves the mark.
  return { next: { ...prev, tasks, focus, focusSeen: deviceNow }, changed: changed || seenChanged }
}

export function ledgerTasks(local: IglooLocal): IglooTaskInput[] {
  return Object.entries(local.tasks).map(([id, at]) => ({ id, completedAt: at || null }))
}
