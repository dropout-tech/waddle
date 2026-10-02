/**
 * Keeps at most one store session, bound to one signed-in user.
 *
 * The session outlives the purchase screen on purpose: disposing it logs the
 * store SDK out, and a purchase that the store finishes later (Ask to Buy,
 * bank verification) must still land on the account that started it. It ends
 * when the signed-in user changes or signs out — and the next user's session
 * is only created after the previous one has finished logging out, so the two
 * can never interleave.
 */
export function createBillingSessionStore<S extends { dispose(): Promise<void> }>(load: (userId: string) => Promise<S>) {
  let current: { userId: string; session: Promise<S> } | null = null
  let settled: Promise<void> = Promise.resolve()
  function release(): Promise<void> {
    const old = current
    current = null
    if (old) settled = settled.then(() => old.session).then((session) => session.dispose()).catch(() => undefined)
    return settled
  }
  return {
    acquire(userId: string): Promise<S> {
      if (current?.userId === userId) return current.session
      const session = release().then(() => load(userId))
      const entry = { userId, session }
      current = entry
      // A failed load is not kept: the next acquire tries again.
      session.catch(() => { if (current === entry) current = null })
      return session
    },
    /** Call with every auth change; anything other than the same user ends the session. */
    userChanged(userId: string | null): Promise<void> {
      return current && current.userId !== userId ? release() : settled
    },
    release,
  }
}
