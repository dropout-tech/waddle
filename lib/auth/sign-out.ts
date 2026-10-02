import { createClient } from '@/lib/supabase/client'
import { clearAllNotebookDrafts, readNotebookDrafts } from '@/lib/notebook-draft'
import { flushAllPendingWrites } from '@/lib/pending-writes'

// The one way the app signs a user out (user menu, suspended-account
// screen; account deletion has its own variant below). Signing out removes
// local copies of the user's own text — the notebook drafts in localStorage
// — so it doesn't stay readable in this browser (shared computer). Other
// localStorage keys (panel sizes, show-completed toggle, theme…) hold no
// user content.
//
// A draft is the only copy of text that hasn't reached the server, so:
//   1. prepareSignOut() sends every pending write while the session still
//      works and waits for it;
//   2. if drafts are still left (offline, conflict copy refused…), the UI
//      asks before signing out (components/auth/use-safe-sign-out.tsx);
//   3. completeSignOut() clears them only once the sign-out succeeded.

export async function prepareSignOut(): Promise<{ userId: string | null; unsynced: number }> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user.id ?? null
  // Drafts left by a notebook that is closed now are re-sent by the
  // notebook module's own flusher; make sure it's loaded (and registered)
  // even on a page that never opened the notebook.
  if (userId && readNotebookDrafts(userId).length > 0) {
    await import('@/hooks/use-notebook').catch(() => undefined)
  }
  // Capped at 5 s: a save that never answers must not freeze sign-out (the
  // suspended-account screen has no other way out). Whatever didn't land is
  // still a draft (or reported by its flusher) and counted below, so the
  // user is asked. A save still hanging at the cap is unconfirmed too —
  // possibly sticky text with no backup — so it always asks then.
  const unsentWithoutBackup = await Promise.race([
    flushAllPendingWrites(),
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5000)),
  ])
  if (!userId) return { userId, unsynced: 0 }
  const drafts = readNotebookDrafts(userId).length
  const unsynced = unsentWithoutBackup === 'timeout' ? Math.max(drafts, 1) : drafts + unsentWithoutBackup
  return { userId, unsynced }
}

export async function completeSignOut(userId: string | null) {
  const { error } = await createClient().auth.signOut()
  // A failed sign-out keeps the user signed in — and their drafts with them.
  if (!error) clearAllNotebookDrafts(userId)
  return { error }
}

/** After the account was deleted on the server: nothing can be synced any
 *  more, so the drafts go regardless. `userId` is read before deleting. */
export async function signOutAfterAccountDeletion(userId: string | null) {
  clearAllNotebookDrafts(userId)
  return createClient().auth.signOut()
}
