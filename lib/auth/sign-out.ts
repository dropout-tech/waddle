import { createClient } from '@/lib/supabase/client'
import { clearAllNotebookDrafts } from '@/lib/notebook-draft'

// The one way the app signs a user out (user menu, suspended-account
// screen, account deletion). Besides ending the session it removes local
// copies of the user's own text — the notebook drafts in localStorage — so
// it doesn't stay readable in this browser (shared computer) or outlive a
// deleted account. Other localStorage keys added alongside the drafts
// (panel sizes, show-completed toggle, theme…) hold no user content.
//
// Drafts are only cleared once the sign-out succeeded: a failed sign-out
// keeps the user signed in, and their unsent text with them.
export async function signOutAndClearLocalData(opts: { accountDeleted?: boolean } = {}) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user.id ?? null
  if (opts.accountDeleted) clearAllNotebookDrafts(userId)
  const { error } = await supabase.auth.signOut()
  if (!error || opts.accountDeleted) clearAllNotebookDrafts(userId)
  return { error }
}
