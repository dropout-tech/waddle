// Client trigger for the cleanup-images Edge Function, which deletes the
// signed-in user's uploaded images (notebook-images bucket) that are >24h old
// and no longer referenced anywhere. Best-effort and silent: any failure is
// swallowed — the next launch simply tries again.
//
// When it runs:
//   - on launch, at most once per 24h per account (ImageCleanupBridge);
//   - shortly after a notebook note is deleted (notes have no undo).
// Never while the in-memory undo/redo stack holds anything: undoing a task
// delete or a notes edit would bring an image reference back, and the image
// must still exist when it does. A page reload clears that stack, so the next
// launch-time run is always safe.
import { createClient } from '@/lib/supabase/client'
import { hasUndoHistory } from '@/lib/undo-stack'

const LAST_RUN_KEY = 'huddle:image-cleanup:last-run:'
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000
const AFTER_DELETE_DELAY_MS = 5_000

let inFlight = false
let pendingTimer: ReturnType<typeof setTimeout> | undefined

function readLastRun(userId: string): number {
  try {
    return Number(window.localStorage.getItem(LAST_RUN_KEY + userId)) || 0
  } catch {
    return 0
  }
}

function writeLastRun(userId: string) {
  try {
    window.localStorage.setItem(LAST_RUN_KEY + userId, String(Date.now()))
  } catch {
    /* localStorage unavailable; worst case it runs again next launch */
  }
}

async function run(userId: string, { throttle }: { throttle: boolean }) {
  if (typeof window === 'undefined' || inFlight || hasUndoHistory()) return
  if (throttle && Date.now() - readLastRun(userId) < MIN_INTERVAL_MS) return
  inFlight = true
  writeLastRun(userId)
  try {
    await createClient().functions.invoke('cleanup-images', { method: 'POST' })
  } catch {
    /* best-effort */
  } finally {
    inFlight = false
  }
}

/** Launch-time run: at most once per 24h for this account. */
export function runImageCleanupOnLaunch(userId: string) {
  void run(userId, { throttle: true }).catch(() => {})
}

/** After a delete that has no undo: run soon, coalescing rapid deletes. */
export function scheduleImageCleanupAfterDelete(userId: string) {
  if (typeof window === 'undefined') return
  clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => {
    void run(userId, { throttle: false }).catch(() => {})
  }, AFTER_DELETE_DELAY_MS)
}
