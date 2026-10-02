// Writes that are still waiting on this page (debounced notebook / sticky
// note text, retries queued after a failed save). Signing out must send them
// first — once the session is gone they can only fail, and the account's
// local backups are about to be removed. Each data hook registers a flusher
// for as long as it is mounted.
//
// A flusher may resolve to how many items it still couldn't send AND that
// have no other local backup (sticky-note text lives only in memory).
// Notebook text is backed up as drafts, which sign-out counts itself.

type Flusher = () => Promise<number | void>

const flushers = new Set<Flusher>()

export function registerPendingWrites(flush: Flusher): () => void {
  flushers.add(flush)
  return () => {
    flushers.delete(flush)
  }
}

/** Send everything pending and wait until each attempt has finished
 *  (succeeded, or failed and stayed backed up). Resolves to the number of
 *  unsent items no local backup covers (see Flusher). Never throws. */
export async function flushAllPendingWrites(): Promise<number> {
  const results = await Promise.allSettled([...flushers].map((f) => f()))
  return results.reduce((sum, r) => sum + (r.status === 'fulfilled' && typeof r.value === 'number' ? r.value : 0), 0)
}
