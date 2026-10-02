// Writes that are still waiting on this page (debounced notebook / sticky
// note text, retries queued after a failed save). Signing out must send them
// first — once the session is gone they can only fail, and the account's
// local backups are about to be removed. Each data hook registers a flusher
// for as long as it is mounted.

type Flusher = () => Promise<void>

const flushers = new Set<Flusher>()

export function registerPendingWrites(flush: Flusher): () => void {
  flushers.add(flush)
  return () => {
    flushers.delete(flush)
  }
}

/** Send everything pending and wait until each attempt has finished
 *  (succeeded, or failed and stayed backed up). Never throws. */
export async function flushAllPendingWrites(): Promise<void> {
  await Promise.allSettled([...flushers].map((f) => f()))
}
